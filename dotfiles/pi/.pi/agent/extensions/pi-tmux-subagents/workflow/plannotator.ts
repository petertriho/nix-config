import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	accessSync,
	closeSync,
	constants,
	fstatSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	realpathSync,
	statSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { normalizeWorkflowDataValues } from "./schema.ts";
import {
	WORKFLOW_IDENTIFIER_PATTERN,
	type NormalizedWorkflowDefinition,
	type WorkflowDataValueMap,
	type WorkflowRunSnapshot,
} from "./types.ts";

export type WorkflowGateStatus = "starting" | "running" | "completed" | "failed" | "interrupted";
export type WorkflowGateDecision = "approved" | "annotated" | "dismissed";

/** Feedback is deliberately NOT a workflow data slot: whitespace is meaningful. */
export interface WorkflowGateAttempt {
	readonly id: string;
	readonly runId: string;
	readonly sessionId: string;
	readonly gate: string;
	readonly artifact: string;
	readonly target: string;
	readonly reviewDirectory: boolean;
	readonly resultPath: string;
	readonly startedAt: string;
	readonly updatedAt: string;
	readonly finishedAt?: string;
	readonly status: WorkflowGateStatus;
	readonly decision?: WorkflowGateDecision;
	readonly feedback?: string;
	readonly failureReason?: string;
	readonly sessionUrl?: string;
	readonly exitCode?: number | null;
	readonly signal?: string | null;
	readonly logs?: string;
}

export type WorkflowGateRun = WorkflowRunSnapshot & {
	readonly gateHistory?: readonly WorkflowGateAttempt[];
};

export interface WorkflowGateInput {
	readonly runId: string;
	readonly gate: string;
	readonly artifact: string;
	readonly reviewDirectory?: boolean;
	readonly data?: Readonly<Record<string, string>>;
}

export interface WorkflowGateAcknowledgement {
	readonly runId: string;
	readonly attemptId: string;
	readonly gate: string;
	readonly target: string;
	readonly resultPath: string;
	readonly status: "starting";
	readonly message: string;
}

/**
 * Map result notifications to Pi's async steer delivery; opened notifications can
 * be non-triggering UI/custom messages. Recheck sessionId at the delivery boundary.
 * Full feedback lives in the persisted attempt and original file, not details.
 */
export interface WorkflowGateNotification {
	readonly type: "workflow_gate_opened" | "workflow_gate_result";
	readonly sessionId: string;
	readonly runId: string;
	readonly attemptId: string;
	readonly resultPath: string;
	readonly status: WorkflowGateStatus;
	readonly content: string;
	readonly decision?: WorkflowGateDecision;
	readonly sessionUrl?: string;
}

export interface WorkflowGateDependencies {
	getActiveRun(): WorkflowGateRun | null;
	/** Stable parent-session/branch ownership token, not a mutable UI context. */
	getSessionId(): string | null;
	/**
	 * Synchronously upsert by attempt.id, persist the snapshot, then expose it
	 * through getActiveRun. On the first write also merge normalized data.
	 * Throw on persistence failure. Never write an attempt into another session.
	 */
	persistAttempt(attempt: WorkflowGateAttempt, data?: WorkflowDataValueMap): void;
	notify(notification: WorkflowGateNotification): void;
	spawn?: (command: string, args: string[], options: SpawnOptions) => ChildProcess;
	now?: () => Date;
	newId?: () => string;
	/** Persistence/delivery faults are surfaced here, never converted to approval. */
	onError?: (error: Error) => void;
	maxLogChars?: number;
	maxMessageChars?: number;
}

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const STATUSES: readonly WorkflowGateStatus[] = ["starting", "running", "completed", "failed", "interrupted"];
const DECISIONS: readonly WorkflowGateDecision[] = ["approved", "annotated", "dismissed"];
const ATTEMPT_KEYS = new Set([
	"id", "runId", "sessionId", "gate", "artifact", "target", "reviewDirectory",
	"resultPath", "startedAt", "updatedAt", "finishedAt", "status", "decision",
	"feedback", "failureReason", "sessionUrl", "exitCode", "signal", "logs",
]);

function record(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object.`);
	}
	return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
	if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
	return value;
}

function timestamp(value: unknown, label: string): string {
	const result = text(value, label);
	if (!Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) {
		throw new Error(`${label} must be a canonical ISO timestamp.`);
	}
	return result;
}

function absolutePath(value: unknown, label: string): string {
	const result = text(value, label);
	if (result.includes("\0") || !isAbsolute(result) || resolve(result) !== result) {
		throw new Error(`${label} must be an absolute normalized path.`);
	}
	return result;
}

function validGate(value: unknown): string {
	const gate = text(value, "gate");
	if (gate.length > 64 || !WORKFLOW_IDENTIFIER_PATTERN.test(gate)) {
		throw new Error("gate must be a safe lowercase label (letters, digits, hyphens; at most 64 characters).");
	}
	return gate;
}

function contained(parent: string, child: string): boolean {
	const path = relative(parent, child);
	return path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function validUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}

/** Strict on decision and feedback types, tolerant of CLI metadata additions. */
export function parseWorkflowGateDecision(value: unknown): {
	readonly decision: WorkflowGateDecision;
	readonly feedback?: string;
} {
	const raw = record(value, "Plannotator result");
	if (!DECISIONS.includes(raw.decision as WorkflowGateDecision)) {
		throw new Error("Plannotator result has an unknown decision.");
	}
	if (Object.hasOwn(raw, "feedback") && typeof raw.feedback !== "string") {
		throw new Error("Plannotator result.feedback must be a string when present.");
	}
	return Object.freeze({
		decision: raw.decision as WorkflowGateDecision,
		...(Object.hasOwn(raw, "feedback") ? { feedback: raw.feedback as string } : {}),
	});
}

/** No filesystem access: historical artifacts may legitimately no longer exist. */
export function parseWorkflowGateAttempt(value: unknown): WorkflowGateAttempt {
	const raw = record(value, "workflow gate attempt");
	for (const key of Object.keys(raw)) {
		if (!ATTEMPT_KEYS.has(key)) throw new Error(`Unknown workflow gate attempt field "${key}".`);
	}
	const id = text(raw.id, "gate attempt.id");
	if (!ID_PATTERN.test(id)) throw new Error("gate attempt.id is unsafe.");
	const runId = text(raw.runId, "gate attempt.runId");
	const sessionId = text(raw.sessionId, "gate attempt.sessionId");
	const gate = validGate(raw.gate);
	const artifact = text(raw.artifact, "gate attempt.artifact");
	const target = absolutePath(raw.target, "gate attempt.target");
	const resultPath = absolutePath(raw.resultPath, "gate attempt.resultPath");
	if (typeof raw.reviewDirectory !== "boolean") throw new Error("gate attempt.reviewDirectory must be a boolean.");
	const artifactDirectory = raw.reviewDirectory ? target : dirname(target);
	if (contained(artifactDirectory, resultPath)) {
		throw new Error("gate attempt.resultPath must be outside the artifact directory.");
	}
	const startedAt = timestamp(raw.startedAt, "gate attempt.startedAt");
	const updatedAt = timestamp(raw.updatedAt, "gate attempt.updatedAt");
	if (!STATUSES.includes(raw.status as WorkflowGateStatus)) throw new Error("gate attempt.status is invalid.");
	const status = raw.status as WorkflowGateStatus;
	const pending = status === "starting" || status === "running";
	const finishedAt = raw.finishedAt === undefined ? undefined : timestamp(raw.finishedAt, "gate attempt.finishedAt");
	if (pending === (finishedAt !== undefined)) throw new Error("gate attempt.finishedAt must occur only on a final attempt.");
	if (updatedAt < startedAt || (finishedAt && (finishedAt < startedAt || finishedAt !== updatedAt))) {
		throw new Error("gate attempt timestamps are inconsistent.");
	}
	const result = status === "completed" ? parseWorkflowGateDecision(raw) : undefined;
	if (status !== "completed" && (raw.decision !== undefined || raw.feedback !== undefined)) {
		throw new Error("Only completed gate attempts may contain a decision or feedback.");
	}
	const failureReason = status === "failed" || status === "interrupted"
		? text(raw.failureReason, "gate attempt.failureReason") : undefined;
	if (!failureReason && raw.failureReason !== undefined) throw new Error("Only failed/interrupted attempts may contain failureReason.");
	if (raw.sessionUrl !== undefined && (typeof raw.sessionUrl !== "string" || !validUrl(raw.sessionUrl))) {
		throw new Error("gate attempt.sessionUrl must be an HTTP(S) URL.");
	}
	if (raw.logs !== undefined && typeof raw.logs !== "string") throw new Error("gate attempt.logs must be a string.");
	if (raw.exitCode !== undefined && raw.exitCode !== null && !Number.isInteger(raw.exitCode)) {
		throw new Error("gate attempt.exitCode must be an integer or null.");
	}
	if (raw.signal !== undefined && raw.signal !== null && typeof raw.signal !== "string") {
		throw new Error("gate attempt.signal must be a string or null.");
	}
	if (pending && (raw.exitCode !== undefined || raw.signal !== undefined)) {
		throw new Error("Pending gate attempts cannot have exit metadata.");
	}
	if (status === "completed" && (raw.exitCode !== 0 || (raw.signal !== undefined && raw.signal !== null))) {
		throw new Error("Completed gate attempts require a successful process exit.");
	}
	return Object.freeze({
		id, runId, sessionId, gate, artifact, target, resultPath,
		reviewDirectory: raw.reviewDirectory, startedAt, updatedAt, status,
		...(finishedAt ? { finishedAt } : {}),
		...(result ?? {}),
		...(failureReason ? { failureReason } : {}),
		...(raw.sessionUrl !== undefined ? { sessionUrl: raw.sessionUrl as string } : {}),
		...(raw.logs !== undefined ? { logs: raw.logs as string } : {}),
		...(raw.exitCode !== undefined ? { exitCode: raw.exitCode as number | null } : {}),
		...(raw.signal !== undefined ? { signal: raw.signal as string | null } : {}),
	});
}

export function parseWorkflowGateHistory(
	value: unknown,
	context?: { runId: string; definition: NormalizedWorkflowDefinition; projectRoot: string },
): readonly WorkflowGateAttempt[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value)) throw new Error("workflow gateHistory must be an array.");
	const history = value.map(parseWorkflowGateAttempt);
	const ids = new Set<string>();
	const paths = new Set<string>();
	for (const attempt of history) {
		if (ids.has(attempt.id) || paths.has(attempt.resultPath)) throw new Error("workflow gateHistory contains reused attempt IDs or result paths.");
		ids.add(attempt.id);
		paths.add(attempt.resultPath);
		if (context) {
			if (attempt.runId !== context.runId) throw new Error("gate attempt runId does not match its run.");
			if (!Object.hasOwn(context.definition.data, attempt.artifact)
				|| context.definition.data[attempt.artifact]?.kind !== "file") {
				throw new Error("gate attempt artifact must name a declared file slot.");
			}
			if (!contained(context.projectRoot, attempt.target) || !contained(context.projectRoot, attempt.resultPath)) {
				throw new Error("gate attempt paths must stay inside the project root.");
			}
		}
	}
	const pending = history.filter(isWorkflowGatePending);
	if (pending.length > 1 || (pending.length === 1 && history.at(-1) !== pending[0])) {
		throw new Error("Only the latest workflow gate attempt may be pending.");
	}
	return Object.freeze(history);
}

export function isWorkflowGatePending(attempt: WorkflowGateAttempt): boolean {
	return attempt.status === "starting" || attempt.status === "running";
}

export function getPendingWorkflowGate(run: WorkflowGateRun | null): WorkflowGateAttempt | undefined {
	return run?.gateHistory?.find(isWorkflowGatePending);
}

export function hasPendingWorkflowGate(run: WorkflowGateRun | null): boolean {
	return getPendingWorkflowGate(run) !== undefined;
}

/** Restore, abort, and replacement must not reconnect to a pending browser. */
export function interruptWorkflowGateHistory(
	history: readonly WorkflowGateAttempt[] | undefined,
	reason = "Browser review interrupted; ask the gate's chat fallback question.",
	now: () => Date = () => new Date(),
): readonly WorkflowGateAttempt[] | undefined {
	if (!history) return undefined;
	const at = now().toISOString();
	return Object.freeze(history.map((attempt) => isWorkflowGatePending(attempt)
		? Object.freeze({ ...attempt, status: "interrupted" as const, failureReason: reason, updatedAt: at, finishedAt: at })
		: attempt));
}

function existsIncludingSymlink(path: string): boolean {
	try {
		lstatSync(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
		throw error;
	}
}

function prepareTarget(run: WorkflowGateRun, input: WorkflowGateInput): {
	target: string; resultDirectory: string; projectRoot: string; data: WorkflowDataValueMap;
} {
	if (!Object.hasOwn(run.definition.data, input.artifact) || run.definition.data[input.artifact]?.kind !== "file") {
		throw new Error(`Workflow artifact "${input.artifact}" must name a declared file data slot.`);
	}
	if (input.reviewDirectory !== undefined && typeof input.reviewDirectory !== "boolean") {
		throw new Error("reviewDirectory must be a boolean.");
	}
	if (input.data !== undefined) record(input.data, "workflow gate data");
	const normalized = normalizeWorkflowDataValues(run.definition, { ...run.data, ...input.data }, { projectRoot: run.projectRoot });
	if (normalized.status === "invalid") {
		throw new Error(normalized.diagnostics.map((entry) => `${entry.path}: ${entry.message}`).join("\n"));
	}
	const file = normalized.values[input.artifact];
	if (!file) throw new Error(`Workflow file slot "${input.artifact}" has no target.`);
	const projectRoot = realpathSync(run.projectRoot);
	if (!contained(projectRoot, realpathSync(file))) throw new Error("Gate target must stay inside the canonical project root.");
	if (!statSync(file).isFile()) throw new Error("Gate artifact must be a readable regular file.");
	accessSync(file, constants.R_OK);
	const artifactDirectory = dirname(file);
	const target = input.reviewDirectory ? artifactDirectory : file;
	accessSync(target, constants.R_OK);
	const sibling = `${artifactDirectory}-decisions`;
	if (!contained(projectRoot, sibling)) throw new Error("Gate decision directory must stay inside the project root.");
	// The existing parent is canonical. Do not mkdir recursively through symlinks.
	if (!existsIncludingSymlink(sibling)) mkdirSync(sibling, { mode: 0o700 });
	const resultDirectory = realpathSync(sibling);
	if (!contained(projectRoot, resultDirectory) || contained(artifactDirectory, resultDirectory)) {
		throw new Error("Gate decision directory must stay inside the canonical project root and outside the artifact directory.");
	}
	if (!statSync(resultDirectory).isDirectory()) throw new Error("Gate decision path must be a directory.");
	accessSync(resultDirectory, constants.W_OK);
	return { target, resultDirectory, projectRoot, data: normalized.values };
}

interface OwnedAttempt {
	attempt: WorkflowGateAttempt;
	readonly projectRoot: string;
	readonly resultDirectory: string;
	child?: ChildProcess;
	settled: boolean;
	logs: string;
	processError?: string;
	detach?: () => void;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function ignoreLateError(): void {}

/**
 * No Pi dependency or phase policy. Start is synchronous/fire-and-forget.
 * Call interrupt BEFORE abort/replacement/session switch; shutdown permanently
 * closes this controller. Restored histories use interruptWorkflowGateHistory.
 */
export function createWorkflowGateController(deps: WorkflowGateDependencies) {
	const owned = new Map<string, OwnedAttempt>();
	const reservedPaths = new Set<string>();
	const reservedIds = new Set<string>();
	const now = deps.now ?? (() => new Date());
	const newId = deps.newId ?? randomUUID;
	const spawnProcess = deps.spawn ?? spawn;
	const maxLogChars = Math.max(256, deps.maxLogChars ?? 8_192);
	const maxMessageChars = Math.max(512, deps.maxMessageChars ?? 24_000);
	let shutdown = false;

	function report(error: unknown): void {
		deps.onError?.(error instanceof Error ? error : new Error(String(error)));
	}

	function current(entry: OwnedAttempt): boolean {
		const run = deps.getActiveRun();
		return !entry.settled && owned.get(entry.attempt.id) === entry
			&& deps.getSessionId() === entry.attempt.sessionId
			&& run?.runId === entry.attempt.runId && run.status === "active"
			&& getPendingWorkflowGate(run)?.id === entry.attempt.id;
	}

	function detach(entry: OwnedAttempt, kill: boolean): void {
		entry.settled = true;
		owned.delete(entry.attempt.id);
		entry.detach?.();
		if (kill && entry.child) {
			try { entry.child.kill("SIGTERM"); } catch (error) { report(error); }
		}
	}

	function save(entry: OwnedAttempt, attempt: WorkflowGateAttempt): void {
		const frozen = Object.freeze(attempt);
		deps.persistAttempt(frozen);
		entry.attempt = frozen;
	}

	function notify(entry: OwnedAttempt, type: WorkflowGateNotification["type"], content: string): void {
		// Do not deliver into a different session even if persistence switched it.
		const run = deps.getActiveRun();
		if (deps.getSessionId() !== entry.attempt.sessionId
			|| run?.runId !== entry.attempt.runId || run.status !== "active"
			|| run.gateHistory?.at(-1)?.id !== entry.attempt.id) return;
		const attempt = entry.attempt;
		deps.notify({
			type, sessionId: attempt.sessionId, runId: attempt.runId,
			attemptId: attempt.id, resultPath: attempt.resultPath, status: attempt.status, content,
			...(attempt.decision ? { decision: attempt.decision } : {}),
			...(attempt.sessionUrl ? { sessionUrl: attempt.sessionUrl } : {}),
		});
	}

	function resultContent(attempt: WorkflowGateAttempt): string {
		let content = `Workflow gate "${attempt.gate}" ${attempt.status}. Run: ${attempt.runId}; attempt: ${attempt.id}.\n`
			+ `Result file: ${attempt.resultPath}\n`;
		if (attempt.status !== "completed") {
			return content + `${attempt.failureReason}\nAsk this gate's chat fallback question; no browser approval was accepted.`;
		}
		content += `Decision: ${attempt.decision}.\n`;
		if (attempt.decision === "dismissed") content += "Ask this gate's chat fallback question before continuing.\n";
		if (attempt.feedback !== undefined) {
			const feedback = `Feedback (verbatim):\n<workflow_gate_feedback>\n${attempt.feedback}\n</workflow_gate_feedback>`;
			content += content.length + feedback.length <= maxMessageChars
				? feedback
				: "Feedback exceeds the message limit; none is reproduced here. Read the full feedback from the result file before acting.";
		}
		return content;
	}

	function finish(entry: OwnedAttempt, outcome: {
		status: "completed" | "failed";
		decision?: WorkflowGateDecision;
		feedback?: string;
		failureReason?: string;
		exitCode?: number | null;
		signal?: string | null;
	}): void {
		if (!current(entry)) { detach(entry, true); return; }
		// Detach first: duplicate close/error events cannot race persistence/delivery.
		detach(entry, false);
		const at = now().toISOString();
		try {
			save(entry, { ...entry.attempt, ...outcome, updatedAt: at, finishedAt: at, logs: entry.logs });
			notify(entry, "workflow_gate_result", resultContent(entry.attempt));
		} catch (error) {
			// An unpersisted outcome must never authorize the next phase.
			report(error);
		}
	}

	function readDecision(entry: OwnedAttempt) {
		const path = entry.attempt.resultPath;
		if (realpathSync(entry.resultDirectory) !== entry.resultDirectory
			|| !contained(entry.projectRoot, realpathSync(path))
			|| realpathSync(path) !== path) {
			throw new Error("Gate result path changed or escaped its canonical decision directory.");
		}
		const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		try {
			if (!fstatSync(fd).isFile()) throw new Error("Gate result must be a regular file.");
			return parseWorkflowGateDecision(JSON.parse(readFileSync(fd, "utf8")));
		} finally {
			closeSync(fd);
		}
	}

	function watch(entry: OwnedAttempt, child: ChildProcess): void {
		const streams = [child.stdout, child.stderr];
		const decoders = streams.map(() => new StringDecoder("utf8"));
		const tails = ["", ""];
		function inspectLine(line: string): void {
			if (entry.attempt.sessionUrl) return;
			const clean = line.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
			// CLI readiness prints a URL on its own line or with a short label.
			// Do not mistake a URL inside the final JSON feedback for the browser.
			const url = clean.trim().match(/^(?:(?:Open|Review|URL)[ :]+)?(https?:\/\/[^\s<>"']+)$/i)?.[1];
			if (!url || !validUrl(url)) return;
			save(entry, { ...entry.attempt, sessionUrl: url, updatedAt: now().toISOString() });
			notify(entry, "workflow_gate_opened", `Workflow gate "${entry.attempt.gate}" is open: ${url}\nThe browser decision will arrive automatically; do not poll.`);
		}
		function output(index: number, chunk: Buffer | string): void {
			if (!current(entry)) { detach(entry, true); return; }
			try {
				const text = typeof chunk === "string" ? chunk : decoders[index]!.write(chunk);
				entry.logs = (entry.logs + text).slice(-maxLogChars);
				const lines = (tails[index] + text).split(/[\r\n]/);
				tails[index] = lines.pop()!.slice(-maxLogChars);
				for (const line of lines) inspectLine(line);
			} catch (error) { detach(entry, true); report(error); }
		}
		const handlers = streams.map((_, index) => (chunk: Buffer | string) => output(index, chunk));
		const onSpawn = () => {
			if (!current(entry)) { detach(entry, true); return; }
			try {
				save(entry, { ...entry.attempt, status: "running", updatedAt: now().toISOString() });
			} catch (error) { detach(entry, true); report(error); }
		};
		const onError = (error: Error) => {
			if (!current(entry)) { detach(entry, true); return; }
			entry.processError ??= error.message;
			// Node emits close after error (including ENOENT). Never read early.
		};
		const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
			if (!current(entry)) { detach(entry, true); return; }
			let result: ReturnType<typeof parseWorkflowGateDecision>;
			try {
				for (let index = 0; index < tails.length; index++) inspectLine(tails[index]! + decoders[index]!.end());
				if (entry.processError) throw new Error(entry.processError);
				if (code !== 0 || signal) throw new Error(`Plannotator exited unsuccessfully (code ${code}, signal ${signal ?? "none"}).`);
				result = readDecision(entry);
			} catch (error) {
				finish(entry, { status: "failed", failureReason: errorText(error), exitCode: code, signal });
				return;
			}
			finish(entry, { status: "completed", ...result, exitCode: code, signal });
		};
		streams.forEach((stream, index) => stream?.on("data", handlers[index]!));
		child.on("spawn", onSpawn);
		child.on("error", onError);
		child.on("close", onClose);
		entry.detach = () => {
			streams.forEach((stream, index) => stream?.removeListener("data", handlers[index]!));
			child.removeListener("spawn", onSpawn);
			child.removeListener("close", onClose);
			child.removeListener("error", onError);
			// EventEmitter treats an unhandled late error as an exception.
			child.on("error", ignoreLateError);
		};
	}

	function start(input: WorkflowGateInput): WorkflowGateAcknowledgement {
		if (shutdown) throw new Error("Workflow gate controller is shut down.");
		const run = deps.getActiveRun();
		if (!run || run.status !== "active" || run.runId !== input.runId) throw new Error(`Workflow run "${input.runId}" is stale or unknown.`);
		const sessionId = text(deps.getSessionId(), "parent session ownership");
		if (hasPendingWorkflowGate(run) || [...owned.values()].some((entry) => entry.attempt.runId === run.runId)) {
			throw new Error("This workflow already has a pending browser gate.");
		}
		if (run.activeLaunch?.status === "starting" || run.activeLaunch?.status === "running") {
			throw new Error("A browser gate cannot overlap an active workflow role.");
		}
		const gate = validGate(input.gate);
		const prepared = prepareTarget(run, input);
		const startedAt = now().toISOString();
		let id = "";
		let resultPath = "";
		for (let tries = 0; tries < 32; tries++) {
			id = newId();
			if (!ID_PATTERN.test(id)) throw new Error("Generated gate attempt ID is unsafe.");
			resultPath = join(prepared.resultDirectory, `${gate}-${startedAt.replace(/[-:.]/g, "")}-${id}.json`);
			if (!reservedPaths.has(resultPath) && !reservedIds.has(id)
				&& !run.gateHistory?.some((attempt) => attempt.id === id || attempt.resultPath === resultPath)
				&& !existsIncludingSymlink(resultPath)) break;
			resultPath = "";
		}
		if (!resultPath) throw new Error("Unable to allocate a new gate result path; existing paths are never reused.");
		const attempt: WorkflowGateAttempt = Object.freeze({
			id, runId: run.runId, sessionId, gate, artifact: input.artifact,
			target: prepared.target, reviewDirectory: input.reviewDirectory ?? false,
			resultPath, startedAt, updatedAt: startedAt, status: "starting",
		});
		reservedPaths.add(resultPath);
		reservedIds.add(id);
		deps.persistAttempt(attempt, prepared.data);
		const entry: OwnedAttempt = { attempt, ...prepared, settled: false, logs: "" };
		owned.set(id, entry);
		try {
			if (!current(entry)) throw new Error("Gate ownership changed before launch.");
			if (realpathSync(prepared.target) !== prepared.target
				|| realpathSync(prepared.resultDirectory) !== prepared.resultDirectory
				|| existsIncludingSymlink(resultPath)) throw new Error("Gate paths changed before launch.");
			const child = spawnProcess("plannotator", [
				"annotate", prepared.target, "--gate", "--json", "--result-file", resultPath,
			], { cwd: prepared.projectRoot, stdio: ["ignore", "pipe", "pipe"], shell: false });
			entry.child = child;
			watch(entry, child);
		} catch (error) {
			// No process exists to emit close after a synchronous startup exception.
			queueMicrotask(() => finish(entry, { status: "failed", failureReason: errorText(error) }));
		}
		return Object.freeze({
			runId: run.runId, attemptId: id, gate, target: attempt.target, resultPath,
			status: "starting",
			message: `Workflow gate "${gate}" launched asynchronously. The harness will deliver workflow_gate_result automatically; do not poll.`,
		});
	}

	function interrupt(reason = "Browser review interrupted; ask the gate's chat fallback question.", runId?: string): void {
		for (const entry of [...owned.values()]) {
			if (runId !== undefined && entry.attempt.runId !== runId) continue;
			const mayPersist = current(entry);
			detach(entry, true);
			if (!mayPersist) continue;
			const at = now().toISOString();
			try {
				save(entry, { ...entry.attempt, status: "interrupted", failureReason: reason, updatedAt: at, finishedAt: at, logs: entry.logs });
			} catch (error) { report(error); }
		}
	}

	return {
		start,
		interrupt,
		shutdown(reason?: string): void { shutdown = true; interrupt(reason); },
	};
}

export type WorkflowGateController = ReturnType<typeof createWorkflowGateController>;
