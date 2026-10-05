/**
 * Protocol-v2 task RPC provider for TaskExecute/TaskStop/TaskOutput.
 *
 * Protocol contract:
 *   - requests: `subagents:rpc:{ping,spawn,stop,consume}` with `{ requestId }`
 *   - replies:  `subagents:rpc:<method>:reply:<requestId>` carrying the
 *     envelope `{ success: true, data? } | { success: false, error }`
 *   - discovery: `subagents:ready` emitted once handlers are live
 *   - lifecycle: `subagents:completed` `{id,type,description,result}` and
 *     `subagents:failed` `{id,type,description,status,error,result}` with
 *     status "failed" | "aborted" | "stopped"
 *
 * Panes, watching, and model registries are injected by index.ts.
 */

import type { ResolvedModelSelection } from "../profiles/model-picker.ts";
import type { TaskAgentProfile } from "./profiles.ts";
import {
	TaskRunStore,
	classifyTaskResult,
	type TaskLifecycleEvent,
	type TaskResultLike,
	type TaskRunHandle,
	type TaskRunState,
} from "./store.ts";

export const TASK_RPC_PROTOCOL_VERSION = 2;

export type RpcReply<T = void> =
	| { success: true; data?: T }
	| { success: false; error: string };

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

/** Registry claim used to avoid registering alongside another provider. */
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

export function shouldRegisterTaskRpc(env: TaskRpcEnvLike = process.env): boolean {
	return !isTaskRpcChildSession(env);
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider conflict detection
// ─────────────────────────────────────────────────────────────────────────────

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
		options.requestId ?? `pi-subagents-probe-${Math.random().toString(16).slice(2, 10)}`;
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
		// Below 1 means unlimited.
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
// The bridge
// ─────────────────────────────────────────────────────────────────────────────

export interface TaskSpawnSpec {
	type: string;
	prompt: string;
	options: NormalizedTaskSpawnOptions;
	profile: TaskAgentProfile;
	resolvedModel: ResolvedModelSelection;
}

export interface TaskRpcRuntimeHooks {
	launch(spec: TaskSpawnSpec): Promise<TaskRunHandle>;
	watch(handle: TaskRunHandle, signal: AbortSignal): Promise<TaskResultLike>;
	sendEscape(handle: TaskRunHandle): void;
	/** Safe to call on an already-dead pane. */
	closeSurface(handle: TaskRunHandle): void;
	readPartialResult(handle: TaskRunHandle): string | undefined;
}

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
	ping(): { version: number };
	/**
	 * Spawn a task child. Validates and resolves before any pane is created,
	 * replies after command dispatch, and defers watching by one event-loop
	 * turn so the caller stores the returned id before terminal events.
	 */
	spawn(request: { type: string; prompt: string; options?: TaskSpawnOptions }): Promise<{ id: string }>;
	stop(id: string): Promise<void>;
	consume(id: string): void;
	activeIds(): string[];
	getRecord(id: string): TaskRunState | undefined;
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
			// Killing the pane without an event would strand the task:
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
	isChildSession?: () => boolean;
	foreignManagerCheck?: () => boolean;
	providerPing?: (events: RpcEventBus, options: { timeoutMs?: number }) => Promise<boolean>;
}

/**
 * Register the protocol handlers on the root session's event bus, unless:
 *  - this is a child Pi process (PI_SUBAGENT_ID / PI_SUBAGENT_SESSION set); or
 *  - another provider has claimed the manager registry; or
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

export * from "./profiles.ts";
export * from "./models.ts";
export * from "./store.ts";
