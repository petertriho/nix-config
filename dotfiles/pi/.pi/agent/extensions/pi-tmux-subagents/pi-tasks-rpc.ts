/**
 * Task-RPC bridge for pi-tmux-subagents: the protocol-v2 provider that
 * upstream `@tintinweb/pi-tasks` (0.9.0) expects for TaskExecute/TaskStop/
 * TaskOutput execution.
 *
 * Upstream contract (pi-tasks src/index.ts + pi-subagents
 * src/cross-extension-rpc.ts, both protocol v2):
 *   - requests: `subagents:rpc:{ping,spawn,stop,consume}` with `{ requestId }`
 *   - replies:  `subagents:rpc:<method>:reply:<requestId>` carrying the
 *     envelope `{ success: true, data? } | { success: false, error }`
 *   - discovery: `subagents:ready` emitted once handlers are live
 *   - lifecycle: `subagents:completed` `{id,type,description,result}` and
 *     `subagents:failed` `{id,type,description,status,error,result}` with
 *     status "failed" | "aborted" | "stopped"
 *
 * Everything Pi/tmux-specific (panes, watching, model registries) is injected,
 * so the protocol state machine is unit-testable without a terminal. The
 * wiring that supplies the real hooks lives in index.ts.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readAgentModelConfig } from "./agent-models.ts";
import {
	parseExplicitModelSelection,
	resolveConfiguredAgentModel,
	type ResolvedModelSelection,
} from "./model-picker.ts";

/** RPC protocol version — bumped when the envelope or method contracts change. */
export const TASK_RPC_PROTOCOL_VERSION = 2;

/** RPC reply envelope — matches pi-mono's RpcResponse shape. */
export type RpcReply<T = void> =
	| { success: true; data?: T }
	| { success: false; error: string };

/** Minimal event bus interface needed by the RPC handlers (pi.events). */
export interface RpcEventBus {
	on(channel: string, handler: (data: unknown) => void): () => void;
	emit(channel: string, data: unknown): void;
}

const PING_CHANNEL = "subagents:rpc:ping";
const SPAWN_CHANNEL = "subagents:rpc:spawn";
const STOP_CHANNEL = "subagents:rpc:stop";
const CONSUME_CHANNEL = "subagents:rpc:consume";
export const SUBAGENTS_READY_CHANNEL = "subagents:ready";
export const SUBAGENTS_COMPLETED_CHANNEL = "subagents:completed";
export const SUBAGENTS_FAILED_CHANNEL = "subagents:failed";

/** Symbol under which the original pi-subagents exposes its manager. */
const MANAGER_KEY = Symbol.for("pi-subagents:manager");

// ─────────────────────────────────────────────────────────────────────────────
// Child detection & registration eligibility
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskRpcEnvLike {
	PI_SUBAGENT_ID?: string;
	PI_SUBAGENT_SESSION?: string;
}

/**
 * True inside a child Pi process started by this extension (or original
 * pi-subagents): children must never register task RPC handlers or answer
 * pings, or a task spawned from the root would be answered twice.
 */
export function isTaskRpcChildSession(env: TaskRpcEnvLike = process.env): boolean {
	return Boolean(env.PI_SUBAGENT_ID || env.PI_SUBAGENT_SESSION);
}

/** Registration is root-session-only. */
export function shouldRegisterTaskRpc(env: TaskRpcEnvLike = process.env): boolean {
	return !isTaskRpcChildSession(env);
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider conflict detection
// ─────────────────────────────────────────────────────────────────────────────

/** True when the original pi-subagents has claimed the manager registry. */
export function isForeignManagerRegistered(scope: unknown = globalThis): boolean {
	return (scope as Record<symbol, unknown>)[MANAGER_KEY] !== undefined;
}

/**
 * Bounded ping for an already-bound protocol provider: emit a ping with a
 * fresh requestId and see whether anybody answers within `timeoutMs`.
 * Resolves false on timeout. The tmux bridge calls this *before* registering
 * its own handlers, so it can never answer its own probe.
 */
export function pingExistingProvider(
	events: RpcEventBus,
	options: { timeoutMs?: number; requestId?: string } = {},
): Promise<boolean> {
	const timeoutMs = options.timeoutMs ?? 250;
	const requestId =
		options.requestId ?? `pi-tmux-subagents-probe-${Math.random().toString(16).slice(2, 10)}`;
	return new Promise<boolean>((resolve) => {
		const timer = setTimeout(() => {
			unsubscribe();
			resolve(false);
		}, timeoutMs);
		const unsubscribe = events.on(`${PING_CHANNEL}:reply:${requestId}`, () => {
			clearTimeout(timer);
			unsubscribe();
			resolve(true);
		});
		events.emit(PING_CHANNEL, { requestId });
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Spawn payload normalization
// ─────────────────────────────────────────────────────────────────────────────

/** Options pi-tasks 0.9.0 actually sends on `subagents:rpc:spawn`. */
export interface TaskSpawnOptions {
	description?: string;
	isBackground?: boolean;
	model?: string;
	maxTurns?: number;
	/** Rejected safety-sensitive options another caller might forward. */
	cwd?: unknown;
	inheritContext?: unknown;
	isolated?: unknown;
	worktree?: unknown;
	[key: string]: unknown;
}

export interface NormalizedTaskSpawnOptions {
	description?: string;
	isBackground: boolean;
	model?: string;
	maxTurns?: number;
}

/**
 * Option names this bridge must never silently weaken: honoring `cwd` would
 * move a task agent outside the shared checkout, and the isolation flags
 * promise execution guarantees (worktrees, context inheritance) this
 * extension does not provide.
 */
const UNSUPPORTED_SAFETY_OPTIONS = [
	"cwd",
	"inheritContext",
	"isolated",
	"worktree",
	"worktreeIsolation",
] as const;

/**
 * Normalize the pi-tasks spawn options. Unknown cosmetic fields are ignored;
 * unsupported safety-sensitive fields are rejected with an actionable error
 * instead of being silently dropped.
 */
export function normalizeTaskSpawnOptions(
	raw: TaskSpawnOptions | undefined,
): NormalizedTaskSpawnOptions {
	const options = raw ?? {};
	for (const key of UNSUPPORTED_SAFETY_OPTIONS) {
		if (options[key] != null) {
			throw new Error(
				`Task execution does not support "${key}": concurrent task agents share one ` +
					`checkout and are sequenced with task dependencies instead of isolation. ` +
					`Remove the option or use blockedBy dependencies.`,
			);
		}
	}
	if (options.model != null && typeof options.model !== "string") {
		throw new Error(`Task spawn option "model" must be a string.`);
	}
	let maxTurns: number | undefined;
	if (options.maxTurns != null) {
		if (typeof options.maxTurns !== "number" || !Number.isFinite(options.maxTurns)) {
			throw new Error(`Task spawn option "maxTurns" must be a finite number.`);
		}
		// Matches pi-subagents' normalizeMaxTurns: below 1 means unlimited.
		if (options.maxTurns >= 1) maxTurns = Math.floor(options.maxTurns);
	}
	return {
		...(options.description != null && typeof options.description === "string"
			? { description: options.description }
			: {}),
		isBackground: options.isBackground !== false,
		...(options.model ? { model: options.model } : {}),
		...(maxTurns == null ? {} : { maxTurns }),
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Autonomous agent-profile resolution
// ─────────────────────────────────────────────────────────────────────────────

export type TaskAgentSource = "project" | "global" | "bundled";

export interface TaskAgentProfileDirs {
	/** Project-local `.pi/agents` — highest precedence. */
	project: string;
	/** `<agentDir>/agents` (PI_CODING_AGENT_DIR aware). */
	global: string;
	/** Profiles bundled with this extension — lowest precedence. */
	bundled: string;
}

export interface TaskAgentProfile {
	/** File basename without `.md` — the spawn identifier. */
	fileName: string;
	source: TaskAgentSource;
	path: string;
	name: string;
	model?: string;
	tools?: string;
	autoExit?: boolean;
	interactive?: boolean;
	cli?: string;
}

export type TaskAgentResolution =
	| { ok: true; profile: TaskAgentProfile }
	| { ok: false; error: string };

function getFrontmatterValue(frontmatter: string, key: string): string | undefined {
	const match = frontmatter.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
	return match ? match[1].trim() : undefined;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
	return value == null ? undefined : value === "true";
}

/**
 * Parse the subset of agent frontmatter the task bridge cares about. Kept
 * local (rather than importing index.ts) so the protocol module stays
 * import-cycle-free; index.ts's full parser owns the remaining fields.
 */
export function parseTaskAgentProfile(
	content: string,
	fileName: string,
	source: TaskAgentSource,
	path: string,
): TaskAgentProfile | null {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return null;
	const frontmatter = match[1];
	return {
		fileName,
		source,
		path,
		name: getFrontmatterValue(frontmatter, "name") ?? fileName,
		model: getFrontmatterValue(frontmatter, "model"),
		tools: getFrontmatterValue(frontmatter, "tools"),
		autoExit: parseOptionalBoolean(getFrontmatterValue(frontmatter, "auto-exit")),
		interactive: parseOptionalBoolean(getFrontmatterValue(frontmatter, "interactive")),
		cli: getFrontmatterValue(frontmatter, "cli"),
	};
}

function listProfileDirs(dirs: TaskAgentProfileDirs): Array<{ dir: string; source: TaskAgentSource }> {
	return [
		{ dir: dirs.project, source: "project" },
		{ dir: dirs.global, source: "global" },
		{ dir: dirs.bundled, source: "bundled" },
	];
}

function readProfile(dir: string, fileName: string, source: TaskAgentSource): TaskAgentProfile | null {
	const path = join(dir, `${fileName}.md`);
	if (!existsSync(path)) return null;
	return parseTaskAgentProfile(readFileSync(path, "utf8"), fileName, source, path);
}

function listAvailableTaskAgents(dirs: TaskAgentProfileDirs): TaskAgentProfile[] {
	const seen = new Set<string>();
	const profiles: TaskAgentProfile[] = [];
	for (const { dir, source } of listProfileDirs(dirs)) {
		if (!existsSync(dir)) continue;
		for (const file of readdirSync(dir).filter((entry) => entry.endsWith(".md"))) {
			const fileName = file.replace(/\.md$/, "");
			if (seen.has(fileName.toLowerCase())) continue;
			const profile = readProfile(dir, fileName, source);
			if (profile) {
				seen.add(fileName.toLowerCase());
				profiles.push(profile);
			}
		}
	}
	return profiles;
}

/**
 * Resolve a requested agent type against the effective project, global, and
 * bundled profile directories (same precedence as ordinary tmux agents):
 *
 * 1. An exact filename wins (project before global before bundled).
 * 2. Otherwise a single case-insensitive match is accepted.
 * 3. Multiple case-insensitive matches are rejected with the candidates.
 * 4. Unknown names are rejected with the available profile list — never a
 *    silent fallback to a generic agent.
 *
 * Profiles that are interactive, explicitly non-auto-exiting, or CLI-backed
 * are rejected: they cannot honor the autonomous task contract.
 */
export function resolveTaskAgentProfile(
	requested: string,
	dirs: TaskAgentProfileDirs,
): TaskAgentResolution {
	const name = requested.trim();
	if (!name) return { ok: false, error: "Task agent type is empty." };

	for (const { dir, source } of listProfileDirs(dirs)) {
		const exact = readProfile(dir, name, source);
		if (exact) return checkTaskProfileSafety(exact, name);
	}

	const candidates: TaskAgentProfile[] = [];
	for (const { dir, source } of listProfileDirs(dirs)) {
		if (!existsSync(dir)) continue;
		for (const file of readdirSync(dir).filter((entry) => entry.endsWith(".md"))) {
			const fileName = file.replace(/\.md$/, "");
			if (fileName.toLowerCase() !== name.toLowerCase()) continue;
			const profile = readProfile(dir, fileName, source);
			if (profile) candidates.push(profile);
		}
	}
	if (candidates.length === 1) return checkTaskProfileSafety(candidates[0], name);
	if (candidates.length > 1) {
		const list = candidates.map((c) => `${c.source}:${c.fileName}`).join(", ");
		return {
			ok: false,
			error: `Ambiguous task agent type "${name}" — matches ${list}. Pass an exact profile name.`,
		};
	}

	const available = listAvailableTaskAgents(dirs)
		.map((p) => p.fileName)
		.sort()
		.join(", ");
	return {
		ok: false,
		error:
			`Unknown task agent type "${name}". Available agent profiles: ${available}. ` +
			`Add a project, global, or bundled profile instead of falling back to a generic agent.`,
	};
}

function checkTaskProfileSafety(profile: TaskAgentProfile, requested: string): TaskAgentResolution {
	if (profile.cli) {
		return {
			ok: false,
			error:
				`Task agent "${requested}" uses the ${profile.cli} CLI, which cannot honor the ` +
				`autonomous task lifecycle. Use a pi-backed autonomous profile.`,
		};
	}
	if (profile.interactive === true) {
		return {
			ok: false,
			error:
				`Task agent "${requested}" is interactive (interactive: true) and needs a user ` +
				`driving its pane. TaskExecute workers must run autonomously. ` +
				`Set interactive: false (or remove the flag) to make it usable for tasks.`,
		};
	}
	if (profile.autoExit === false) {
		return {
			ok: false,
			error:
				`Task agent "${requested}" opts out of auto-exit (auto-exit: false), so it would ` +
				`never report completion. Set auto-exit: true to make it usable for tasks.`,
		};
	}
	return { ok: true, profile };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuzzy authenticated model resolution (pi-subagents-compatible)
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskModelLike {
	id: string;
	name?: string;
	provider: string;
}

export interface TaskModelRegistryLike<T extends TaskModelLike = TaskModelLike> {
	getAvailable(): readonly T[];
}

function normalizeModelToken(value: string): string {
	return value.toLowerCase().replace(/\./g, "-");
}

function formatAvailableModels(available: readonly TaskModelLike[]): string {
	return available
		.map((m) => `  ${m.provider}/${m.id}`)
		.sort()
		.join("\n");
}

/**
 * Resolve a task model override the way pi-subagents' `resolveModel` does,
 * searching only authenticated (`getAvailable()`) models:
 *
 * 1. Exact `provider/modelId`.
 * 2. Fuzzy: case-insensitive, `.` and `-` equivalent in versions, substring on
 *    id/name/full reference, tolerant of an optional trailing date stamp.
 * 3. A `provider/modelId` whose provider does not serve it retries the bare
 *    id against every provider (the same model elsewhere beats no match).
 *
 * Returns the canonical model entry, or an error string listing the available
 * models — never a silent fallback to the parent model.
 */
export function resolveTaskModelOverride<T extends TaskModelLike>(
	input: string,
	registry: TaskModelRegistryLike<T>,
): T | string {
	const available = registry.getAvailable();
	const trimmed = input.trim();
	const query = normalizeModelToken(trimmed);

	// 1. Exact provider/modelId (case-insensitive on the canonical string).
	const slashIdx = query.indexOf("/");
	if (slashIdx !== -1) {
		const exact = available.find(
			(m) => normalizeModelToken(`${m.provider}/${m.id}`) === query,
		);
		if (exact) return exact;
	}

	// 2. Scored fuzzy match — deterministic: highest score wins, ties break on
	// the canonical provider/model string so the same input always resolves
	// the same way.
	let best: T | undefined;
	let bestScore = 0;
	let bestKey = "";
	for (const m of available) {
		const id = normalizeModelToken(m.id);
		const name = normalizeModelToken(m.name ?? "");
		const full = normalizeModelToken(`${m.provider}/${m.id}`);

		let score = 0;
		if (id === query || full === query) {
			score = 100;
		} else if (id.includes(query) || full.includes(query)) {
			score = 60 + (query.length / id.length) * 30;
		} else if (name && name.includes(query)) {
			score = 40 + (query.length / name.length) * 20;
		} else if (
			query
				.split(/[\s\-/]+/)
				.filter(Boolean)
				.every(
					(part) =>
						/^\d{8}$/.test(part) ||
						id.includes(part) ||
						(name.length > 0 && name.includes(part)) ||
						m.provider.toLowerCase().includes(part),
				)
		) {
			score = 20;
		}

		const key = `${m.provider}/${m.id}`;
		if (score > bestScore || (score === bestScore && score > 0 && key < bestKey)) {
			bestScore = score;
			best = m;
			bestKey = key;
		}
	}
	if (best != null && bestScore >= 20) return best;

	// 3. Provider fallback: retry the bare model id across all providers.
	const originalSlash = trimmed.indexOf("/");
	if (originalSlash !== -1 && originalSlash + 1 < trimmed.length) {
		const bare = resolveTaskModelOverride(trimmed.slice(originalSlash + 1), registry);
		if (typeof bare !== "string") return bare;
	}

	return `Model not found: "${input}".\n\nAvailable models:\n${formatAvailableModels(available)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model precedence for a task launch
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskModelContext<T extends TaskModelLike = TaskModelLike> {
	modelRegistry: TaskModelRegistryLike<T>;
	/** Parent session model (`ctx.model`), used only as the last resort. */
	parentModel?: T;
	/** Directory holding agent-models.json for configured per-agent defaults. */
	agentDir: string;
}

/**
 * Resolve the model for one task launch. Precedence (PLAN §5.7):
 *
 *   1. the pi-tasks `model` override (fuzzy, authenticated only);
 *   2. the `agent-models.json` entry for the resolved profile;
 *   3. the profile frontmatter `model`;
 *   4. the parent session model.
 *
 * An explicit override that cannot resolve fails hard — never falls back.
 */
export function resolveTaskLaunchModel<T extends TaskModelLike>(input: {
	override?: string;
	profile: TaskAgentProfile;
	ctx: TaskModelContext<T>;
}): ResolvedModelSelection {
	if (input.override) {
		const resolved = resolveTaskModelOverride(input.override, input.ctx.modelRegistry);
		if (typeof resolved === "string") throw new Error(resolved);
		return toResolvedSelection(resolved, "explicit");
	}

	const config = readAgentModelConfig(input.ctx.agentDir);
	if (config.status === "invalid") {
		throw new Error(
			`${config.error} Fix or remove the file, or run /agent-models, before executing tasks.`,
		);
	}
	const configured =
		config.status === "ok" ? config.config.agents[input.profile.fileName] : undefined;
	if (configured) {
		// SAFETY: resolveConfiguredAgentModel only reads ctx.modelRegistry; the
		// other PickerContext fields (ui, hasUI, model, scopedModels) are unused
		// on this validated non-interactive path.
		const pickerCtx = { modelRegistry: input.ctx.modelRegistry } as unknown as Parameters<
			typeof resolveConfiguredAgentModel
		>[1];
		return resolveConfiguredAgentModel(configured, pickerCtx, input.profile.fileName);
	}

	if (input.profile.model) {
		// SAFETY: parseExplicitModelSelection only reads provider/id/name from
		// the available entries, which TaskModelLike guarantees.
		const available = input.ctx.modelRegistry.getAvailable() as unknown as Parameters<
			typeof parseExplicitModelSelection
		>[1];
		const parsed = parseExplicitModelSelection(input.profile.model, available);
		return {
			model: parsed.model,
			selection: {
				provider: parsed.model.provider,
				model: parsed.model.id,
				...(parsed.thinking ? { thinking: parsed.thinking } : {}),
			},
			argument: parsed.thinking
				? `${parsed.model.provider}/${parsed.model.id}:${parsed.thinking}`
				: `${parsed.model.provider}/${parsed.model.id}`,
			source: "agent",
		};
	}

	if (input.ctx.parentModel) {
		return toResolvedSelection(input.ctx.parentModel, "parent");
	}

	throw new Error(
		`No model for task agent "${input.profile.fileName}": no override, configured default, ` +
			`or profile model, and the parent session has no active model.`,
	);
}

function toResolvedSelection(
	model: TaskModelLike,
	source: ResolvedModelSelection["source"],
): ResolvedModelSelection {
	return {
		// SAFETY: task model entries come from ctx.modelRegistry.getAvailable(),
		// whose elements are Model<Api> instances; TaskModelLike is the
		// structural subset this module needs.
		model: model as ResolvedModelSelection["model"],
		selection: { provider: model.provider, model: model.id },
		argument: `${model.provider}/${model.id}`,
		source,
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Task-run state machine
// ─────────────────────────────────────────────────────────────────────────────

export type TaskRunPhase = "starting" | "running" | "stopping" | "settled";

export interface TaskRunTerminal {
	status: "completed" | "failed" | "aborted" | "stopped";
	result?: string;
	error?: string;
}

/** Shape shared with index.ts `RunningSubagent` — the bridge's pane handle. */
export interface TaskRunHandle {
	id: string;
	surface: string;
	sessionFile: string;
	abortController?: AbortController;
}

export interface TaskRunState {
	id: string;
	requestedType: string;
	resolvedAgent: string;
	description: string;
	phase: TaskRunPhase;
	stopRequested: boolean;
	consumed: boolean;
	terminal?: TaskRunTerminal;
	handle?: TaskRunHandle;
}

/** Lifecycle payload emitted on settlement — one per run, never two. */
export type TaskLifecycleEvent =
	| {
			kind: "completed";
			id: string;
			type: string;
			description: string;
			result?: string;
	  }
	| {
			kind: "failed";
			id: string;
			type: string;
			description: string;
			status: "failed" | "aborted" | "stopped";
			error?: string;
			result?: string;
	  };

export const DEFAULT_SETTLED_RETENTION = 64;

/**
 * Adapter-owned task-run records, kept separate from the extension's general
 * `runningSubagents` map. Every terminal path funnels through `finalize`,
 * which emits at most one lifecycle event per run; settled records are
 * retained (bounded, FIFO) so `consume` and repeated-stop validation still
 * work after the pane is gone.
 */
export class TaskRunStore {
	private readonly active = new Map<string, TaskRunState>();
	private readonly settled = new Map<string, TaskRunState>();
	private readonly onLifecycle: (event: TaskLifecycleEvent) => void;
	private readonly maxSettled: number;

	constructor(
		onLifecycle: (event: TaskLifecycleEvent) => void,
		maxSettled: number = DEFAULT_SETTLED_RETENTION,
	) {
		this.onLifecycle = onLifecycle;
		this.maxSettled = maxSettled;
	}

	add(record: TaskRunState): void {
		this.active.set(record.id, record);
	}

	getActive(id: string): TaskRunState | undefined {
		return this.active.get(id);
	}

	getSettled(id: string): TaskRunState | undefined {
		return this.settled.get(id);
	}

	has(id: string): boolean {
		return this.active.has(id) || this.settled.has(id);
	}

	isSettled(id: string): boolean {
		return this.settled.has(id);
	}

	activeIds(): string[] {
		return [...this.active.keys()];
	}

	settledCount(): number {
		return this.settled.size;
	}

	/**
	 * Idempotent terminal transition. Returns the emitted event exactly once
	 * per run; later calls for the same id (stop/watch/sidecar/shutdown
	 * races) are no-ops.
	 */
	finalize(id: string, terminal: TaskRunTerminal): TaskLifecycleEvent | undefined {
		const record = this.active.get(id);
		if (!record) return undefined;
		this.active.delete(id);
		record.terminal = terminal;
		record.phase = "settled";
		this.settled.set(id, record);
		while (this.settled.size > this.maxSettled) {
			const oldest = this.settled.keys().next().value;
			if (oldest === undefined) break;
			this.settled.delete(oldest);
		}

		if (terminal.status === "completed") {
			const event: TaskLifecycleEvent = {
				kind: "completed",
				id,
				type: record.requestedType,
				description: record.description,
				...(terminal.result == null ? {} : { result: terminal.result }),
			};
			this.onLifecycle(event);
			return event;
		}
		const event: TaskLifecycleEvent = {
			kind: "failed",
			id,
			type: record.requestedType,
			description: record.description,
			status: terminal.status,
			...(terminal.error == null ? {} : { error: terminal.error }),
			...(terminal.result == null ? {} : { result: terminal.result }),
		};
		this.onLifecycle(event);
		return event;
	}

	/** Drop every record (session shutdown). Emits nothing. */
	clear(): void {
		this.active.clear();
		this.settled.clear();
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Watch-outcome classification
// ─────────────────────────────────────────────────────────────────────────────

/** Structural subset of index.ts `SubagentResult` used for classification. */
export interface TaskResultLike {
	exitCode: number;
	summary?: string;
	responded?: boolean;
	error?: string;
	errorMessage?: string;
	ping?: { name: string; message: string };
	/** Set by the hard turn-limit path (PI_SUBAGENT_MAX_TURNS exhaustion). */
	turnLimit?: boolean;
}

export type TaskWatchOutcome =
	| { kind: "completed"; result: string }
	| { kind: "failed"; error: string; result?: string }
	| { kind: "aborted"; error: string; result?: string };

/**
 * Translate a finished child watch into the terminal task outcome:
 *
 * - clean exit with a final assistant message → completed;
 * - `caller_ping` → failed (TaskExecute has no interactive resume channel);
 * - hard turn limit → aborted (pi-tasks reverts the task to pending);
 * - provider error / non-zero exit / no assistant output → failed.
 */
export function classifyTaskResult(result: TaskResultLike): TaskWatchOutcome {
	const partial =
		typeof result.summary === "string" && result.summary.trim() !== ""
			? result.summary
			: undefined;

	if (result.turnLimit) {
		return {
			kind: "aborted",
			error: result.errorMessage ?? "Task agent exceeded its turn limit and was aborted.",
			...(partial ? { result: partial } : {}),
		};
	}
	if (result.ping) {
		return {
			kind: "failed",
			error:
				`Task agent asked for interactive help (caller_ping): ${result.ping.message}. ` +
				`TaskExecute has no interactive channel for answering — adjust the task ` +
				`description or agent profile so the task is answerable autonomously.`,
			...(partial ? { result: partial } : {}),
		};
	}
	if (result.errorMessage) {
		return {
			kind: "failed",
			error: result.errorMessage,
			...(partial ? { result: partial } : {}),
		};
	}
	if (result.exitCode !== 0) {
		return {
			kind: "failed",
			error: result.errorMessage ?? `Task agent exited with code ${result.exitCode}.`,
			...(partial ? { result: partial } : {}),
		};
	}
	if (!result.responded) {
		return {
			kind: "failed",
			error: "Task agent exited without producing a final assistant message.",
		};
	}
	return { kind: "completed", result: result.summary ?? "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// The bridge
// ─────────────────────────────────────────────────────────────────────────────

/** One validated, fully-resolved spawn request handed to the runtime hooks. */
export interface TaskSpawnSpec {
	type: string;
	prompt: string;
	options: NormalizedTaskSpawnOptions;
	profile: TaskAgentProfile;
	resolvedModel: ResolvedModelSelection;
}

/** Pi/tmux operations the bridge needs — injected by index.ts. */
export interface TaskRpcRuntimeHooks {
	/** Create the pane and dispatch the command. Returns after dispatch. */
	launch(spec: TaskSpawnSpec): Promise<TaskRunHandle>;
	/** Long-running watch until the child exits (watchSubagent). */
	watch(handle: TaskRunHandle, signal: AbortSignal): Promise<TaskResultLike>;
	/** Send one Escape keypress to the child pane. */
	sendEscape(handle: TaskRunHandle): void;
	/** Kill the pane. Survives being called on an already-dead pane. */
	closeSurface(handle: TaskRunHandle): void;
	/** Latest partial assistant text from the child session file. */
	readPartialResult(handle: TaskRunHandle): string | undefined;
}

/** Validate + resolve a spawn request into a spec + pane handle. */
export type TaskSpawnResolver = (request: {
	type: string;
	prompt: string;
	options: NormalizedTaskSpawnOptions;
}) => Promise<{ spec: TaskSpawnSpec; handle: TaskRunHandle }>;

export interface TaskRpcBridgeOptions {
	/** Bounded grace between sending Escape and killing the pane (stop path). */
	stopFlushMs?: number;
	/** Bounded settled-record retention. */
	settledRetention?: number;
	/** How long to wait for a foreign provider's ping reply. */
	providerProbeMs?: number;
}

export interface TaskRpcBridge {
	/** Reply to `subagents:rpc:ping`. */
	ping(): { version: number };
	/**
	 * Spawn a task child. Validates and resolves before any pane is created,
	 * replies after command dispatch, and defers watching by one event-loop
	 * turn so the caller stores the returned id before terminal events.
	 */
	spawn(request: { type: string; prompt: string; options?: TaskSpawnOptions }): Promise<{ id: string }>;
	/** Terminal stop of a running task. */
	stop(id: string): Promise<void>;
	/** Mark a settled run consumed. */
	consume(id: string): void;
	/** Currently active (unsettled) run ids. */
	activeIds(): string[];
	/** Inspection helper: a stored record by id. */
	getRecord(id: string): TaskRunState | undefined;
	/** Test helper: settled-record count. */
	settledCount(): number;
	/** Session shutdown: abort watchers, kill panes, drop records. Emits nothing. */
	shutdown(): void;
}

/**
 * Wire one RPC handler: listen on `channel`, run `fn`, emit the reply
 * envelope on `channel:reply:<requestId>` — the pi-mono convention.
 */
function handleRpc<P extends { requestId: string }>(
	events: RpcEventBus,
	channel: string,
	fn: (params: P) => unknown | Promise<unknown>,
): () => void {
	return events.on(channel, async (raw: unknown) => {
		const params = raw as P;
		if (!params || typeof params.requestId !== "string") return;
		try {
			const data = await fn(params);
			const reply: { success: true; data?: unknown } = { success: true };
			if (data !== undefined) reply.data = data;
			events.emit(`${channel}:reply:${params.requestId}`, reply);
		} catch (err) {
			events.emit(`${channel}:reply:${params.requestId}`, {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	});
}

/**
 * The protocol-v2 bridge: adapter-owned task-run records, the idempotent
 * finalizer, deferred watching, terminal stop, and consume semantics. All
 * Pi/tmux operations arrive through `hooks`; profile/model resolution through
 * `resolveAndLaunch`. `attachTaskRpc` binds it to an event bus.
 */
export function createTaskRpcBridge(
	deps: {
		hooks: TaskRpcRuntimeHooks;
		resolveAndLaunch: TaskSpawnResolver;
		onLifecycle: (event: TaskLifecycleEvent) => void;
	},
	options: TaskRpcBridgeOptions = {},
): TaskRpcBridge {
	const stopFlushMs = options.stopFlushMs ?? 1_500;
	const store = new TaskRunStore(deps.onLifecycle, options.settledRetention);
	const watchers = new Map<string, AbortController>();
	const pendingWatchStarts = new Set<string>();
	// Set by shutdown(): once the bridge is closed, a launch that was still
	// creating its pane when shutdown ran must never be registered, watched,
	// or left running — it is closed and rejected instead (no-orphan contract).
	let closed = false;

	async function startWatch(record: TaskRunState): Promise<void> {
		const handle = record.handle;
		if (!handle) return;
		const watcherAbort = new AbortController();
		watchers.set(record.id, watcherAbort);
		try {
			const result = await deps.hooks.watch(handle, watcherAbort.signal);
			if (store.isSettled(record.id)) return; // stop/shutdown already won
			// An accepted stop is terminal as "stopped": when Escape made the
			// child finish during the flush window, that outcome must not publish
			// as a completion — pi-tasks would auto-cascade instead of recording
			// the intentional stop. The latest assistant text is preserved as the
			// partial result.
			if (record.stopRequested) {
				const partial =
					typeof result.summary === "string" && result.summary.trim() !== ""
						? result.summary
						: undefined;
				store.finalize(record.id, {
					status: "stopped",
						error: "Task agent stopped by request.",
						...(partial ? { result: partial } : {}),
					});
				return;
			}
			const outcome = classifyTaskResult(result);
			if (outcome.kind === "completed") {
				store.finalize(record.id, { status: "completed", result: outcome.result });
			} else {
				store.finalize(record.id, {
					status: outcome.kind,
					error: outcome.error,
					...(outcome.result ? { result: outcome.result } : {}),
				});
			}
		} catch (err) {
			if (store.isSettled(record.id)) return;
			store.finalize(record.id, {
				status: "failed",
				error: `Task agent watch failed: ${err instanceof Error ? err.message : String(err)}`,
			});
		} finally {
			watchers.delete(record.id);
			pendingWatchStarts.delete(record.id);
		}
	}

	function scheduleWatch(record: TaskRunState): void {
		pendingWatchStarts.add(record.id);
		void (async () => {
			// The spawn reply is emitted synchronously after spawn() returns,
			// and the caller's reply listener (plus its microtask continuations)
			// runs before this setImmediate callback. Yielding one event-loop
			// turn therefore guarantees the caller stored the returned id
			// before any terminal lifecycle event can arrive — including the
			// already-complete child fixture.
			await new Promise<void>((resolve) => setImmediate(resolve));
			if (!pendingWatchStarts.has(record.id)) return; // stopped/shutdown first
			pendingWatchStarts.delete(record.id);
			if (store.isSettled(record.id)) return;
			record.phase = "running";
			await startWatch(record);
		})();
	}

	async function spawn(request: {
		type: string;
		prompt: string;
		options?: TaskSpawnOptions;
	}): Promise<{ id: string }> {
		// Validation + resolution happen before any pane is created, so a bad
		// agent type, model, or option fails the RPC without side effects.
		const options = normalizeTaskSpawnOptions(request.options);
		const { spec, handle } = await deps.resolveAndLaunch({
			type: request.type,
			prompt: request.prompt,
			options,
		});
		if (closed) {
			// Shutdown won while this pane was being created. Nothing knows about
			// this handle (store cleared, watchers gone, handlers detached), so it
			// must be closed here and now rather than registered and watched.
			try {
				deps.hooks.closeSurface(handle);
			} catch {
				// The pane may already be gone.
			}
			throw new Error(
				"Task bridge shut down while the task agent was launching; the late pane was closed.",
		);
		}
		const record: TaskRunState = {
			id: handle.id,
			requestedType: request.type,
			resolvedAgent: spec.profile.fileName,
			description: options.description ?? spec.profile.fileName,
			phase: "starting",
			stopRequested: false,
			consumed: false,
			handle,
		};
		store.add(record);
		scheduleWatch(record);
		return { id: record.id };
	}

	async function stop(id: string): Promise<void> {
		if (!store.has(id)) throw new Error("Agent not found");
		if (store.isSettled(id)) throw new Error("Agent is not running");
		const active = store.getActive(id);
		if (!active) throw new Error("Agent is not running");

		// Mark first: every later observer (watch, sidecar, shutdown) must see
		// that this run is intentionally being stopped.
		active.stopRequested = true;
		active.phase = "stopping";
		const handle = active.handle;

		if (handle) deps.hooks.sendEscape(handle);

		// Bounded grace: the child may finish its turn and write a clean exit
		// sidecar; the watcher then finalizes normally and this stop becomes a
		// no-op (exactly-once finalization).
		const deadline = Date.now() + stopFlushMs;
		while (Date.now() < deadline && !store.isSettled(id)) {
			await new Promise<void>((resolve) => setTimeout(resolve, 25));
		}
		if (store.isSettled(id)) return;

		// Still alive: kill the watcher, close the pane, finalize as stopped
		// with the latest partial assistant output.
		pendingWatchStarts.delete(id);
		const watcher = watchers.get(id);
		if (watcher) watcher.abort();
		if (handle) deps.hooks.closeSurface(handle);
		const partial = handle ? deps.hooks.readPartialResult(handle) : undefined;
		store.finalize(id, {
			status: "stopped",
			error: "Task agent stopped by request.",
			...(partial ? { result: partial } : {}),
		});
	}

	function consume(id: string): void {
		const record = store.getSettled(id);
		if (!record) throw new Error("Agent not found or still running");
		record.consumed = true;
	}

	function shutdown(): void {
		closed = true;
		for (const id of store.activeIds()) {
			pendingWatchStarts.delete(id);
			const watcher = watchers.get(id);
			if (watcher) watcher.abort();
			const record = store.getActive(id);
			if (record?.handle) {
				try {
					deps.hooks.closeSurface(record.handle);
				} catch {
					// The pane may already be gone; shutdown continues.
				}
			}
			// Killing the pane without an event would strand the task upstream:
			// pi-tasks keeps an in_progress task attached to this agent id and
			// waits for a lifecycle event that never comes. Finalize exactly
			// once (runs that already settled are skipped by the idempotent
			// finalizer) so the task is reported aborted and can be retried.
			let partial: string | undefined;
			if (record?.handle) {
				try {
					partial = deps.hooks.readPartialResult(record.handle);
				} catch {
					// Partial output is best-effort during shutdown.
				}
			}
			store.finalize(id, {
				status: "aborted",
				error:
					"Task agent terminated by parent session shutdown; the task did not complete. Retry the task.",
				...(partial ? { result: partial } : {}),
			});
		}
		watchers.clear();
		pendingWatchStarts.clear();
		store.clear();
	}

	return {
		ping: () => ({ version: TASK_RPC_PROTOCOL_VERSION }),
		spawn,
		stop,
		consume,
		activeIds: () => store.activeIds(),
		getRecord: (id) => store.getActive(id) ?? store.getSettled(id),
		settledCount: () => store.settledCount(),
		shutdown,
	};
}

export interface AttachedTaskRpc {
	bridge: TaskRpcBridge;
	/** Unsubscribe all handlers from the event bus (idempotent). */
	detach(): void;
}

export interface AttachTaskRpcDeps {
	events: RpcEventBus;
	hooks: TaskRpcRuntimeHooks;
	/**
	 * Validate and resolve the spawn request into a spec + pane handle. This
	 * is where index.ts supplies profile resolution, model precedence, and
	 * launchSubagent.
	 */
	resolveAndLaunch: TaskSpawnResolver;
	notify: (message: string) => void;
	options?: TaskRpcBridgeOptions;
	/** Test seams for dependency-injected provider probes. */
	isChildSession?: () => boolean;
	foreignManagerCheck?: () => boolean;
	providerPing?: (events: RpcEventBus, options: { timeoutMs?: number }) => Promise<boolean>;
}

/**
 * Register the protocol handlers on the root session's event bus, unless:
 *  - this is a child Pi process (PI_SUBAGENT_ID / PI_SUBAGENT_SESSION set); or
 *  - the original pi-subagents manager is registered; or
 *  - a bounded ping finds an already-bound provider.
 *
 * In the abstain cases no handler is registered, no `subagents:ready` is
 * emitted, and exactly one clear notice is issued. On registration, the four
 * handlers are wired and `subagents:ready` is emitted once everything is
 * live, so a consumer that missed the factory-time window can re-ping.
 */
export async function attachTaskRpc(deps: AttachTaskRpcDeps): Promise<AttachedTaskRpc | null> {
	const isChild = deps.isChildSession ?? (() => isTaskRpcChildSession());
	const foreignManager = deps.foreignManagerCheck ?? (() => isForeignManagerRegistered());
	const ping = deps.providerPing ?? pingExistingProvider;

	if (isChild()) return null;
	if (foreignManager()) {
		deps.notify(
			"pi-tasks task execution uses the loaded pi-subagents provider; the tmux bridge stays inactive.",
		);
		return null;
	}
	if (await ping(deps.events, { timeoutMs: deps.options?.providerProbeMs })) {
		deps.notify(
			"pi-tasks task execution uses an already-registered subagents RPC provider; the tmux bridge stays inactive.",
		);
		return null;
	}

	const bridge = createTaskRpcBridge(
		{
			hooks: deps.hooks,
			resolveAndLaunch: deps.resolveAndLaunch,
			onLifecycle: (event) => {
				if (event.kind === "completed") {
					deps.events.emit(SUBAGENTS_COMPLETED_CHANNEL, {
						id: event.id,
						type: event.type,
						description: event.description,
						...(event.result == null ? {} : { result: event.result }),
					});
					return;
				}
				deps.events.emit(SUBAGENTS_FAILED_CHANNEL, {
					id: event.id,
					type: event.type,
					description: event.description,
					status: event.status,
					...(event.error == null ? {} : { error: event.error }),
					...(event.result == null ? {} : { result: event.result }),
				});
			},
		},
		deps.options,
	);

	const unsubPing = handleRpc(deps.events, PING_CHANNEL, () => bridge.ping());
	const unsubSpawn = handleRpc<{
		requestId: string;
		type: string;
		prompt: string;
		options?: TaskSpawnOptions;
	}>(deps.events, SPAWN_CHANNEL, (params) =>
		bridge.spawn({ type: params.type, prompt: params.prompt, options: params.options }),
	);
	const unsubStop = handleRpc<{ requestId: string; agentId: string }>(
		deps.events,
		STOP_CHANNEL,
		(params) => bridge.stop(params.agentId),
	);
	const unsubConsume = handleRpc<{ requestId: string; agentId: string }>(
		deps.events,
		CONSUME_CHANNEL,
		(params) => bridge.consume(params.agentId),
	);

	deps.events.emit(SUBAGENTS_READY_CHANNEL, {});

	let detached = false;
	return {
		bridge,
		detach() {
			if (detached) return;
			detached = true;
			unsubPing();
			unsubSpawn();
			unsubStop();
			unsubConsume();
		},
	};
}
