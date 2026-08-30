/**
 * Global Pi extension: clamp every session model's advertised context window to
 * a user-configured maximum.
 *
 * Runtime configuration (managed through the `/context-window-cap` command):
 *
 *     join(getAgentDir(), "context-window-cap.json")
 *     (normally ~/.pi/agent/context-window-cap.json)
 *
 * accepted schema (extra keys are ignored, and preserved by the command):
 *
 *     { "maxContextWindow": 350000 }
 *
 * `/context-window-cap` manages the saved configuration from inside Pi:
 *
 *     /context-window-cap              report the saved (on-disk) state
 *     /context-window-cap 350000       save maxContextWindow: 350000
 *     /context-window-cap 350k         decimal suffix: 350 * 1000
 *     /context-window-cap 1.5m         1.5 * 1000000 = 1500000
 *     /context-window-cap off          delete the config file (cap disabled)
 *
 * `k` and `m` are case-insensitive decimal multipliers (1000 / 1000000), not
 * binary units. Fractional mantissas are accepted only when they expand to a
 * positive safe whole number of tokens; nothing is ever rounded. Plain
 * unsuffixed values must be integers.
 *
 * The command is save-only: it persists changes immediately but never
 * reconfigures the running process, mutates the active controller, or touches
 * enforcement hooks. Every successful mutation says the current runtime is
 * unchanged and asks for `/reload`; until then the active runtime keeps its
 * pre-command state. Setting a value preserves the unknown keys of a readable
 * JSON object and repairs readable malformed or non-object content (writes
 * are atomic temp-file-plus-rename); `off` deletes the whole dedicated file.
 * The command stays registered even when the config is missing or invalid so
 * the cap can be inspected, enabled, or repaired exactly then.
 *
 * `maxContextWindow` must be a finite positive safe integer of tokens. A
 * missing file means the feature is off, silently. A malformed or invalid file
 * emits exactly one `[pi-context-window-cap]` warning and disables the cap for
 * that runtime. Config edits take effect on the next `/reload` (or a new Pi
 * process); the extension restores original values on shutdown so a removed
 * or changed config never leaves a stale cap behind. Only `contextWindow` is
 * assigned; no other model or provider metadata is touched. Dynamic provider
 * extensions can replace the active model after `session_start`; cooperating
 * providers emit `dotfiles:model-catalog-refreshed`, which makes this
 * extension immediately clamp the replacement objects too.
 */
import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
/** Filename of the user-managed runtime configuration. */
export const CAP_CONFIG_FILENAME = "context-window-cap.json";

/** Slash command (registered without the leading slash) managing the config. */
export const CAP_COMMAND_NAME = "context-window-cap";

/** Stable prefix for the single warning emitted on invalid configuration. */
export const WARNING_PREFIX = "[pi-context-window-cap]";

/**
 * Shared custom event emitted after a runtime model-catalog refresh.
 *
 * Keep this value in sync with pi-cliproxyapi-provider.ts.
 */
export const MODEL_CATALOG_REFRESHED_EVENT = "dotfiles:model-catalog-refreshed";

/** Discriminated outcome of reading the runtime configuration. */
export type CapConfigResult =
	| { status: "valid"; maxContextWindow: number }
	| { status: "missing" }
	| { status: "invalid"; reason: string };

/** Result of parsing configuration text. */
export type ParsedCapConfig =
	| { ok: true; maxContextWindow: number }
	| { ok: false; reason: string };

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Whether an fs error is `ENOENT` (the silent "feature off" state). */
function isMissingFileError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { code?: unknown }).code === "ENOENT"
	);
}

/**
 * Parse and validate `context-window-cap.json` contents. The root must be a
 * non-null, non-array JSON object with a finite positive safe-integer
 * `maxContextWindow`; unknown keys are ignored.
 */
export function parseCapConfig(text: string): ParsedCapConfig {
	let root: unknown;
	try {
		root = JSON.parse(text);
	} catch (error) {
		return { ok: false, reason: `malformed JSON (${errorMessage(error)})` };
	}
	if (typeof root !== "object" || root === null || Array.isArray(root)) {
		return { ok: false, reason: "root must be a JSON object" };
	}
	if (!("maxContextWindow" in root)) {
		return { ok: false, reason: 'missing required field "maxContextWindow"' };
	}
	const value = (root as Record<string, unknown>).maxContextWindow;
	if (typeof value !== "number") {
		return { ok: false, reason: '"maxContextWindow" must be a number' };
	}
	if (!Number.isFinite(value)) {
		return { ok: false, reason: '"maxContextWindow" must be a finite number' };
	}
	if (!Number.isSafeInteger(value)) {
		return { ok: false, reason: '"maxContextWindow" must be a safe integer' };
	}
	if (value <= 0) {
		return { ok: false, reason: '"maxContextWindow" must be positive' };
	}
	return { ok: true, maxContextWindow: value };
}

/** Absolute path of the runtime configuration inside an agent directory. */
export function capConfigPath(agentDir: string): string {
	return join(agentDir, CAP_CONFIG_FILENAME);
}

/**
 * Synchronously read and validate the runtime configuration from an agent
 * directory. `ENOENT` is the silent "feature off" state; malformed or invalid
 * content is reported as an invalid state with a reason.
 */
export function readCapConfig(agentDir: string): CapConfigResult {
	let text: string;
	try {
		text = readFileSync(capConfigPath(agentDir), "utf-8");
	} catch (error) {
		if (isMissingFileError(error)) {
			return { status: "missing" };
		}
		return { status: "invalid", reason: `unreadable file (${errorMessage(error)})` };
	}
	const parsed = parseCapConfig(text);
	return parsed.ok
		? { status: "valid", maxContextWindow: parsed.maxContextWindow }
		: { status: "invalid", reason: parsed.reason };
}

// ---------------------------------------------------------------------------
// Config persistence (command mutations)
// ---------------------------------------------------------------------------

/**
 * Filesystem seam for the atomic replace step of `saveCapConfig`.
 * Production always uses `renameSync`; tests may substitute a failing
 * implementation, because no ordinary filesystem state makes the rename fail
 * while temporary-file creation succeeds — both need the same directory
 * permissions.
 */
export const capConfigIo: { renameSync: typeof renameSync } = { renameSync };

/**
 * Read the existing config root for an in-place update. `ENOENT` and any
 * readable but malformed or non-object root become an empty object so a set
 * operation can create or repair the file; other read errors are thrown.
 */
function readCapConfigForUpdate(path: string): Record<string, unknown> {
	let text: string;
	try {
		text = readFileSync(path, "utf-8");
	} catch (error) {
		if (isMissingFileError(error)) return {};
		throw error;
	}
	try {
		const root: unknown = JSON.parse(text);
		if (typeof root === "object" && root !== null && !Array.isArray(root)) {
			return { ...(root as Record<string, unknown>) };
		}
	} catch {
		// Readable but malformed: repaired by replacement below.
	}
	return {};
}

/**
 * Update `maxContextWindow` in the config: unknown keys of a readable object
 * survive, readable malformed/non-object roots are replaced, and the file is
 * swapped atomically through a same-directory temporary file and rename so a
 * concurrently running Pi never observes torn JSON. Throws on filesystem
 * failure (after cleaning up the temporary file).
 */
export function saveCapConfig(agentDir: string, maxContextWindow: number): void {
	const path = capConfigPath(agentDir);
	const root = readCapConfigForUpdate(path);
	root.maxContextWindow = maxContextWindow;
	const text = `${JSON.stringify(root, null, "\t")}\n`;
	const temporaryPath = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
	try {
		writeFileSync(temporaryPath, text, { encoding: "utf-8", mode: 0o600, flag: "wx" });
		chmodSync(temporaryPath, 0o600);
		capConfigIo.renameSync(temporaryPath, path);
	} finally {
		rmSync(temporaryPath, { force: true });
	}
}

/**
 * Idempotently delete the dedicated config file; a missing file already is
 * the disabled state. Non-missing filesystem errors are thrown.
 */
export function removeCapConfig(agentDir: string): void {
	rmSync(capConfigPath(agentDir), { force: true });
}

// ---------------------------------------------------------------------------
// /context-window-cap input parsing
// ---------------------------------------------------------------------------

/** Discriminated outcome of parsing `/context-window-cap` command input. */
export type ParsedCapCommand =
	| { action: "status" }
	| { action: "off" }
	| { action: "set"; maxContextWindow: number }
	| { action: "invalid"; reason: string };

/** `Number.MAX_SAFE_INTEGER` as a BigInt for exact magnitude checks. */
const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

/** Convert an exact non-negative decimal integer into a set action. */
function bigIntToSetAction(value: bigint, input: string): ParsedCapCommand {
	if (value <= 0n) {
		return { action: "invalid", reason: "value must be positive" };
	}
	if (value > MAX_SAFE_INTEGER_BIGINT) {
		return {
			action: "invalid",
			reason: `value ${input} exceeds the maximum safe integer (${Number.MAX_SAFE_INTEGER})`,
		};
	}
	return { action: "set", maxContextWindow: Number(value) };
}

/** Unadorned base-10 integer, e.g. `350000`. */
const PLAIN_INTEGER_PATTERN = /^[0-9]+$/;

/** Decimal mantissa with a `k`/`m` suffix, e.g. `350k`, `1.5m`, `2.25K`. */
const SUFFIXED_VALUE_PATTERN = /^([0-9]+)(?:\.([0-9]+))?([km])$/i;

/** Suffix multipliers in whole tokens (decimal, not binary). */
const SUFFIX_SHIFTS = { k: 3, m: 6 } as const;

/**
 * Parse `/context-window-cap` input into a status, off, set, or invalid
 * action. Suffix arithmetic is exact (BigInt on the decimal digits), so a
 * value is accepted only when it expands to a positive safe whole number of
 * tokens; nothing is ever rounded.
 */
export function parseCapCommandInput(input: string): ParsedCapCommand {
	const trimmed = input.trim();
	if (trimmed === "") return { action: "status" };
	if (trimmed.toLowerCase() === "off") return { action: "off" };
	if (/\s/.test(trimmed)) {
		return { action: "invalid", reason: "expected exactly one argument" };
	}

	if (PLAIN_INTEGER_PATTERN.test(trimmed)) {
		return bigIntToSetAction(BigInt(trimmed), trimmed);
	}

	const suffixed = SUFFIXED_VALUE_PATTERN.exec(trimmed);
	if (suffixed) {
		const fraction = suffixed[2] ?? "";
		const digits = BigInt(`${suffixed[1]}${fraction}`);
		const decimals = fraction.length;
		const shift = SUFFIX_SHIFTS[suffixed[3].toLowerCase() as "k" | "m"];
		if (decimals > shift) {
			const divisor = 10n ** BigInt(decimals - shift);
			if (digits % divisor !== 0n) {
				return {
					action: "invalid",
					reason: `value ${trimmed} does not expand to a whole number of tokens`,
				};
			}
			return bigIntToSetAction(digits / divisor, trimmed);
		}
		return bigIntToSetAction(digits * 10n ** BigInt(shift - decimals), trimmed);
	}

	return {
		action: "invalid",
		reason: `invalid value "${trimmed}": expected a positive integer, a suffixed value such as 350k or 1.5m, or off`,
	};
}

// ---------------------------------------------------------------------------
// /context-window-cap execution
// ---------------------------------------------------------------------------

/** Usage text appended to status and invalid-input notices. */
const CAP_COMMAND_USAGE = [
	`Usage: /${CAP_COMMAND_NAME} <positive tokens|k|m|off>`,
	`Examples: /${CAP_COMMAND_NAME} 350000, /${CAP_COMMAND_NAME} 350k, /${CAP_COMMAND_NAME} 1.5m`,
].join("\n");

/** Notification callback matching `ctx.ui.notify`. */
export type CapNotify = (message: string, severity?: "info" | "warning" | "error") => void;

/**
 * Read the on-disk config for the status action. Unlike `readCapConfig`,
 * non-`ENOENT` filesystem failures are thrown instead of being folded into
 * an invalid-config result, so the command reports them as I/O errors rather
 * than as repairable malformed content (which stays a startup-side concern).
 */
function readCapConfigForStatus(agentDir: string): CapConfigResult {
	let text: string;
	try {
		text = readFileSync(capConfigPath(agentDir), "utf-8");
	} catch (error) {
		if (isMissingFileError(error)) return { status: "missing" };
		throw error;
	}
	const parsed = parseCapConfig(text);
	return parsed.ok
		? { status: "valid", maxContextWindow: parsed.maxContextWindow }
		: { status: "invalid", reason: parsed.reason };
}

/** Status notice describing the on-disk state, never claiming it is active. */
function capStatusNotice(config: CapConfigResult): { message: string; severity: "info" | "warning" } {
	if (config.status === "valid") {
		return {
			message: `Saved context-window cap: ${config.maxContextWindow} tokens (on-disk value; the active runtime may differ until /reload).\n${CAP_COMMAND_USAGE}`,
			severity: "info",
		};
	}
	if (config.status === "missing") {
		return {
			message: `Saved context-window cap: off (no ${CAP_CONFIG_FILENAME}; the active runtime may differ until /reload).\n${CAP_COMMAND_USAGE}`,
			severity: "info",
		};
	}
	return {
		message: `Saved context-window-cap config is invalid: ${config.reason}. Set a value to repair it (the active runtime may differ until /reload).\n${CAP_COMMAND_USAGE}`,
		severity: "warning",
	};
}

/**
 * Execute a parsed `/context-window-cap` invocation against the on-disk
 * config. Save-only: mutations persist immediately but never reconfigure the
 * running Pi process; every success tells the user to run `/reload`.
 */
export async function executeCapCommand(
	agentDir: string,
	args: string,
	notify: CapNotify,
): Promise<void> {
	const parsed = parseCapCommandInput(args);
	switch (parsed.action) {
		case "status": {
			let config: CapConfigResult;
			try {
				config = readCapConfigForStatus(agentDir);
			} catch (error) {
				notify(`Failed to read the saved context-window cap config: ${errorMessage(error)}`, "error");
				return;
			}
			const notice = capStatusNotice(config);
			notify(notice.message, notice.severity);
			return;
		}
		case "set":
			try {
				saveCapConfig(agentDir, parsed.maxContextWindow);
			} catch (error) {
				notify(`Failed to save context-window cap: ${errorMessage(error)}`, "error");
				return;
			}
			notify(
				`Saved context-window cap: ${parsed.maxContextWindow} tokens. Current runtime is unchanged; run /reload to apply it.`,
				"info",
			);
			return;
		case "off":
			try {
				removeCapConfig(agentDir);
			} catch (error) {
				notify(`Failed to disable context-window cap: ${errorMessage(error)}`, "error");
				return;
			}
			notify(
				"Disabled the saved context-window cap. Current runtime is unchanged; run /reload to apply it.",
				"info",
			);
			return;
		case "invalid":
			notify(`${parsed.reason}\n${CAP_COMMAND_USAGE}`, "error");
			return;
		default: {
			// Compile-time exhaustiveness guard: a new ParsedCapCommand variant
			// without a case above fails to typecheck here.
			const unhandled: never = parsed;
			notify(`Unhandled context-window-cap action: ${String(unhandled)}`, "error");
			return;
		}
	}
}

/**
 * Minimal mutable model shape this extension needs. Pi's `Model` objects are
 * structurally assignable; keeping the controller decoupled from Pi types
 * makes the clamping logic independently testable.
 */
export interface ContextWindowModel {
	contextWindow: number;
}

/** Per-model tracking record, keyed by model object identity. */
export interface CapRecord {
	/** Advertised window when this extension first observed the model (or the
	 *  refreshed value after a detected upstream change). */
	originalContextWindow: number;
	/** Value this extension last assigned to the model. */
	lastAppliedContextWindow: number;
}

/**
 * Clamps models' `contextWindow` to a configured maximum, tracking originals
 * by object identity so values can be restored on reload or shutdown without
 * clobbering later third-party mutations.
 */
export class ContextWindowCapController {
	readonly maxContextWindow: number;
	private readonly records = new Map<ContextWindowModel, CapRecord>();

	constructor(maxContextWindow: number) {
		this.maxContextWindow = maxContextWindow;
	}

	/** Whether the model's advertised window is usable; no fallback is invented. */
	private isApplicable(model: ContextWindowModel): boolean {
		const value = model.contextWindow;
		return typeof value === "number" && Number.isFinite(value) && value > 0;
	}

	/** Clamp a single model. Idempotent; assigns only `contextWindow`. */
	apply(model: ContextWindowModel): void {
		if (!this.isApplicable(model)) return;

		const current = model.contextWindow;
		let record = this.records.get(model);
		if (record === undefined) {
			record = {
				originalContextWindow: current,
				lastAppliedContextWindow: current,
			};
			this.records.set(model, record);
		} else if (current !== record.lastAppliedContextWindow) {
			// Someone else (provider refresh, another extension) changed the value
			// after we applied ours; treat the new value as the upstream original.
			record.originalContextWindow = current;
			record.lastAppliedContextWindow = current;
		}

		const effective = Math.min(record.originalContextWindow, this.maxContextWindow);
		model.contextWindow = effective;
		record.lastAppliedContextWindow = effective;
	}

	/** Clamp every model in the iterable; duplicates are idempotent. */
	applyAll(models: Iterable<ContextWindowModel>): void {
		for (const model of models) {
			this.apply(model);
		}
	}

	/**
	 * Restore original values for every tracked model, but only when the model
	 * still carries this extension's last applied value; later external changes
	 * are preserved. Clears all tracking state.
	 */
	restore(): void {
		for (const [model, record] of this.records) {
			if (model.contextWindow === record.lastAppliedContextWindow) {
				model.contextWindow = record.originalContextWindow;
			}
		}
		this.records.clear();
	}

	/** Number of tracked model objects (useful for tests and diagnostics). */
	trackedCount(): number {
		return this.records.size;
	}
}

/** Context shape used for session model collection. Pi's ExtensionContext is
 *  structurally assignable; every member is optional so the collector also
 *  tolerates harnesses and modes that omit them. */
export interface CapSessionContext {
	modelRegistry?: { getAll?(): Iterable<ContextWindowModel | undefined | null> } | undefined;
	model?: ContextWindowModel | undefined | null;
	scopedModels?: readonly ({ model?: ContextWindowModel | undefined | null } | undefined | null)[] | undefined;
}

/**
 * Collect the deduplicated set of model objects an enforcement pass should
 * clamp: registry catalog, active model, scoped models, and any event-selected
 * model. Deduplication is by object identity.
 */
export function collectSessionModels(
	ctx: CapSessionContext,
	...selected: (ContextWindowModel | undefined | null)[]
): ContextWindowModel[] {
	const collected = new Set<ContextWindowModel>();
	const add = (model: ContextWindowModel | undefined | null): void => {
		if (model) collected.add(model);
	};
	for (const model of ctx.modelRegistry?.getAll?.() ?? []) add(model);
	add(ctx.model);
	for (const scoped of ctx.scopedModels ?? []) add(scoped?.model);
	for (const model of selected) add(model);
	return [...collected];
}

export default function piContextWindowCap(pi: ExtensionAPI): void {
	const agentDir = getAgentDir();

	// Registered before startup-config gating so the cap can be inspected,
	// enabled, or repaired exactly when the config is missing or invalid.
	// The command is save-only: it never touches this factory's controller or
	// hooks; changes take effect on the next /reload (or new Pi process).
	pi.registerCommand(CAP_COMMAND_NAME, {
		description: "Show, set, or disable the saved context-window cap (save-only; run /reload to apply)",
		handler: (args, ctx) => executeCapCommand(agentDir, args, ctx.ui.notify),
	});

	const config = readCapConfig(agentDir);
	if (config.status === "invalid") {
		console.warn(
			`${WARNING_PREFIX} ignoring ${CAP_CONFIG_FILENAME}: ${config.reason}. Context-window cap is disabled.`,
		);
		return;
	}
	if (config.status === "missing") return;

	const controller = new ContextWindowCapController(config.maxContextWindow);
	let activeContext: CapSessionContext | undefined;
	const enforce = (
		ctx: CapSessionContext,
		...selected: (ContextWindowModel | undefined | null)[]
	): void => {
		controller.applyAll(collectSessionModels(ctx, ...selected));
	};

	// A dynamic provider refresh can replace the active model object after
	// session_start. Reapply immediately so runtime accounting and the TUI do
	// not revert to the provider's uncapped catalog value.
	pi.events.on(MODEL_CATALOG_REFRESHED_EVENT, () => {
		if (activeContext) enforce(activeContext);
	});

	// Startup, reload, new, resume, and fork sessions.
	pi.on("session_start", (_event, ctx) => {
		activeContext = ctx;
		enforce(ctx);
	});
	// Before Pi's pre-prompt automatic-compaction check; input passes through.
	pi.on("input", (_event, ctx) => {
		enforce(ctx);
	});
	// Before every LLM call, including tool-loop continuations.
	pi.on("context", (_event, ctx) => {
		enforce(ctx);
	});
	// A newly selected, cycled, or restored model object, immediately.
	pi.on("model_select", (event, ctx) => {
		enforce(ctx, event.model);
	});
	// Manual, threshold, and overflow-recovery summarization.
	pi.on("session_before_compact", (_event, ctx) => {
		enforce(ctx);
	});
	// Branch summarization during tree navigation.
	pi.on("session_before_tree", (_event, ctx) => {
		enforce(ctx);
	});
	// Quit, /reload, /new, /resume, /fork: restore before teardown so a later
	// runtime never inherits a stale cap.
	pi.on("session_shutdown", () => {
		activeContext = undefined;
		controller.restore();
	});
}
