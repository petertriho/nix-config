import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { __test__ as indexTestApi } from "./index.ts";
import {
	attachTaskRpc,
	classifyTaskResult,
	createTaskRpcBridge,
	isForeignManagerRegistered,
	isTaskRpcChildSession,
	normalizeTaskSpawnOptions,
	pingExistingProvider,
	resolveTaskAgentProfile,
	resolveTaskLaunchModel,
	resolveTaskModelOverride,
	shouldRegisterTaskRpc,
	SUBAGENTS_COMPLETED_CHANNEL,
	SUBAGENTS_FAILED_CHANNEL,
	SUBAGENTS_READY_CHANNEL,
	type RpcEventBus,
	type TaskAgentProfileDirs,
	type TaskResultLike,
	type TaskRpcRuntimeHooks,
	type TaskSpawnSpec,
	type TaskRunHandle,
} from "./pi-tasks-rpc.ts";

// ── Test event bus: mirrors pi.events' on/emit with delivery logging ──

interface BusLogEntry {
	channel: string;
	data: unknown;
}

function createFakeEventBus() {
	const handlers = new Map<string, Set<(data: unknown) => void>>();
	const log: BusLogEntry[] = [];
	const bus: RpcEventBus = {
		on(channel, handler) {
			let set = handlers.get(channel);
			if (!set) {
				set = new Set();
				handlers.set(channel, set);
			}
			set.add(handler);
			return () => set?.delete(handler);
		},
		emit(channel, data) {
			log.push({ channel, data });
			for (const handler of handlers.get(channel) ?? []) handler(data);
		},
	};
	return { bus, log };
}

/**
 * Client-side RPC helper mirroring pi-tasks' `rpcCall`: emit the request,
 * await the scoped reply, and record delivery order so tests can assert
 * reply-before-terminal-event sequencing.
 */
function rpcCall<T>(
	bus: RpcEventBus,
	channel: string,
	params: Record<string, unknown>,
	options: {
		order?: string[];
		onReply?: (data: T) => void;
		timeoutMs?: number;
	} = {},
): Promise<T> {
	const requestId = `req-${Math.random().toString(16).slice(2, 10)}`;
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() => {
				unsubscribe();
				reject(new Error(`${channel} timeout`));
			},
			options.timeoutMs ?? 2_000,
		);
		const unsubscribe = bus.on(`${channel}:reply:${requestId}`, (raw) => {
			unsubscribe();
			clearTimeout(timer);
			options.onReply?.((raw as { data?: T }).data as T);
			const reply = raw as { success: boolean; data?: T; error?: string };
			if (reply.success) resolve(reply.data as T);
			else reject(new Error(reply.error ?? "rpc error"));
		});
		bus.emit(channel, { requestId, ...params });
	});
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!condition()) {
		if (Date.now() > deadline) throw new Error("waitFor timed out");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

// ── Bridge fixtures ──

function createHarness(
	hookOverrides: Partial<TaskRpcRuntimeHooks> = {},
	bridgeOptions: { stopFlushMs?: number; settledRetention?: number } = {},
) {
	const bus = createFakeEventBus();
	const order: string[] = [];
	const completed: Array<Record<string, unknown>> = [];
	const failed: Array<Record<string, unknown>> = [];
	bus.bus.on(SUBAGENTS_COMPLETED_CHANNEL, (data) => {
		order.push("completed");
		completed.push(data as Record<string, unknown>);
	});
	bus.bus.on(SUBAGENTS_FAILED_CHANNEL, (data) => {
		order.push("failed");
		failed.push(data as Record<string, unknown>);
	});

	const launches: TaskSpawnSpec[] = [];
	const escapes: string[] = [];
	const closedSurfaces: string[] = [];
	const watchControls = new Map<
		string,
		{ resolve: (v: unknown) => void; reject: (e: unknown) => void }
	>();

	const hooks: TaskRpcRuntimeHooks & {
		launches: TaskSpawnSpec[];
		escapes: string[];
		closedSurfaces: string[];
		watchControls: Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>;
	} = {
		launches,
		escapes,
		closedSurfaces,
		watchControls,
		async launch(spec: TaskSpawnSpec): Promise<TaskRunHandle> {
			launches.push(spec);
			return { id: `run${launches.length}`, surface: `%${launches.length}`, sessionFile: `/tmp/run${launches.length}.jsonl` };
		},
		watch(handle: TaskRunHandle): Promise<TaskResultLike> {
			return new Promise<TaskResultLike>((resolve, reject) => {
				watchControls.set(handle.id, { resolve: resolve as (v: unknown) => void, reject });
			});
		},
		sendEscape(handle: TaskRunHandle): void {
			escapes.push(handle.id);
		},
		closeSurface(handle: TaskRunHandle): void {
			closedSurfaces.push(handle.surface);
		},
		readPartialResult(handle: TaskRunHandle): string | undefined {
			return `partial of ${handle.id}`;
		},
		...hookOverrides,
	};

	const profile = {
		fileName: "general-purpose",
		source: "bundled" as const,
		path: "/bundled/agents/general-purpose.md",
		name: "general-purpose",
		autoExit: true,
	};

	async function attach(overrides: Partial<Parameters<typeof attachTaskRpc>[0]> = {}) {
		return attachTaskRpc({
			events: bus.bus,
			hooks,
			// The default resolver pretends validation succeeded and reuses the
			// hook-launched handle; per-test overrides replace it.
			async resolveAndLaunch(request) {
				const handle = await hooks.launch({
					type: request.type,
					prompt: request.prompt,
					options: request.options,
					profile,
					resolvedModel: {
						model: { provider: "p", id: "m" } as never,
						selection: { provider: "p", model: "m" },
						argument: "p/m",
						source: "parent",
					},
				});
				return {
					spec: { type: request.type, prompt: request.prompt, options: request.options, profile, resolvedModel: {
						model: { provider: "p", id: "m" } as never,
						selection: { provider: "p", model: "m" },
						argument: "p/m",
						source: "parent",
					} },
					handle,
				};
			},
			notify: () => {},
			options: { stopFlushMs: 60, ...bridgeOptions },
			providerPing: async () => false,
			foreignManagerCheck: () => false,
			isChildSession: () => false,
			...overrides,
		});
	}

	return { bus, order, completed, failed, hooks, attach };
}

async function settleRun(harness: ReturnType<typeof createHarness>, id: string, result: unknown) {
	// The bridge defers the watch by one event-loop turn after the spawn reply;
	// wait until it has actually started before settling.
	await waitFor(() => harness.hooks.watchControls.has(id));
	const control = harness.hooks.watchControls.get(id);
	assert.ok(control, `no watch control for ${id}`);
	control.resolve(result);
}

// ─────────────────────────────────────────────────────────────────────────────
// Envelopes & registration eligibility
// ─────────────────────────────────────────────────────────────────────────────

test("ping replies with protocol version 2 through the scoped reply channel", async () => {
	const harness = createHarness();
	const attached = await harness.attach();
	assert.ok(attached);

	const reply = await rpcCall<{ version: number }>(harness.bus.bus, "subagents:rpc:ping", {});
	assert.equal(reply.version, 2);
	assert.ok(
		harness.bus.log.some((entry) => entry.channel.startsWith("subagents:rpc:ping:reply:")),
	);
});

test("registration emits subagents:ready exactly once after the handlers are live", async () => {
	const harness = createHarness();
	const ready: unknown[] = [];
	harness.bus.bus.on(SUBAGENTS_READY_CHANNEL, (data) => ready.push(data));
	const attached = await harness.attach();
	assert.ok(attached);

	assert.equal(ready.length, 1);
	// The ping handler answers, proving handlers were wired before ready.
	await rpcCall(harness.bus.bus, "subagents:rpc:ping", {});

	attached?.detach();
	attached?.detach(); // idempotent
	harness.bus.bus.emit("subagents:rpc:ping", { requestId: "after-detach" });
	assert.equal(
		harness.bus.log.filter((e) => e.channel === "subagents:rpc:ping:reply:after-detach").length,
		0,
	);
});

test("child sessions (PI_SUBAGENT_ID / PI_SUBAGENT_SESSION) never register handlers or ready", async () => {
	for (const env of [
		{ PI_SUBAGENT_ID: "child1" },
		{ PI_SUBAGENT_SESSION: "/tmp/child.jsonl" },
	]) {
		assert.ok(isTaskRpcChildSession(env));
		assert.equal(shouldRegisterTaskRpc(env), false);
	}
	assert.equal(isTaskRpcChildSession({}), false);
	assert.equal(shouldRegisterTaskRpc({}), true);

	const harness = createHarness();
	const ready: unknown[] = [];
	harness.bus.bus.on(SUBAGENTS_READY_CHANNEL, (data) => ready.push(data));
	const attached = await harness.attach({ isChildSession: () => true });
	assert.equal(attached, null);
	assert.equal(ready.length, 0);

	// A pi-tasks ping from this process gets no reply.
	await assert.rejects(
		rpcCall(harness.bus.bus, "subagents:rpc:ping", {}, { timeoutMs: 120 }),
		/subagents:rpc:ping timeout/,
	);
});

// ─────────────────────────────────────────────────────────────────────────────
// Provider conflict detection
// ─────────────────────────────────────────────────────────────────────────────

test("manager-symbol detection recognizes the original pi-subagents registry", () => {
	const managerKey = Symbol.for("pi-subagents:manager");
	assert.equal(isForeignManagerRegistered({ [managerKey]: { spawn: () => {} } }), true);
	assert.equal(isForeignManagerRegistered({}), false);
	assert.equal(isForeignManagerRegistered({ unrelated: 1 }), false);
});

test("an existing provider wins: the tmux bridge abstains without duplicate handlers", async () => {
	const managerNotices: string[] = [];
	const pingNotices: string[] = [];

	const managerHarness = createHarness();
	const attachedManager = await managerHarness.attach({
		foreignManagerCheck: () => true,
		notify: (message) => managerNotices.push(message),
	});
	assert.equal(attachedManager, null);
	assert.equal(managerNotices.length, 1);
	assert.match(managerNotices[0], /pi-subagents provider/);
	await assert.rejects(
		rpcCall(managerHarness.bus.bus, "subagents:rpc:ping", {}, { timeoutMs: 120 }),
		/timeout/,
	);

	const pingHarness = createHarness();
	const attachedPing = await pingHarness.attach({
		providerPing: async () => true,
		notify: (message) => pingNotices.push(message),
	});
	assert.equal(attachedPing, null);
	assert.equal(pingNotices.length, 1);
	assert.match(pingNotices[0], /already-registered subagents RPC provider/);
	await assert.rejects(
		rpcCall(pingHarness.bus.bus, "subagents:rpc:spawn", { type: "x", prompt: "y" }, { timeoutMs: 120 }),
		/timeout/,
	);
});

test("pingExistingProvider resolves true only when a foreign provider answers", async () => {
	const { bus } = createFakeEventBus();
	// A foreign provider answers every ping.
	bus.on("subagents:rpc:ping", (data) => {
		const { requestId } = data as { requestId: string };
		bus.emit(`subagents:rpc:ping:reply:${requestId}`, { success: true, data: { version: 2 } });
	});
	assert.equal(await pingExistingProvider(bus, { timeoutMs: 250, requestId: "probe-1" }), true);

	const silent = createFakeEventBus();
	assert.equal(await pingExistingProvider(silent.bus, { timeoutMs: 30, requestId: "probe-2" }), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Spawn option normalization & classification
// ─────────────────────────────────────────────────────────────────────────────

test("normalizeTaskSpawnOptions accepts pi-tasks fields and rejects safety-sensitive ones", () => {
	assert.deepEqual(
		normalizeTaskSpawnOptions({
			description: "Fix the bug",
			isBackground: true,
			model: "sonnet",
			maxTurns: 3,
			unknownCosmetic: "ignored",
		}),
		{ description: "Fix the bug", isBackground: true, model: "sonnet", maxTurns: 3 },
	);
	assert.deepEqual(normalizeTaskSpawnOptions(undefined), { isBackground: true });
	// 0/negative/undefined maxTurns mean unlimited (pi-subagents semantics).
	assert.deepEqual(
		normalizeTaskSpawnOptions({ maxTurns: 0 }),
		{ isBackground: true },
	);
	assert.deepEqual(
		normalizeTaskSpawnOptions({ maxTurns: -2 }),
		{ isBackground: true },
	);
	assert.equal(normalizeTaskSpawnOptions({ maxTurns: 2.9 }).maxTurns, 2);

	for (const key of ["cwd", "inheritContext", "isolated", "worktree"] as const) {
		assert.throws(
			() => normalizeTaskSpawnOptions({ [key]: "value" } as never),
			new RegExp(`does not support "${key}"`),
		);
	}
	assert.throws(() => normalizeTaskSpawnOptions({ maxTurns: "many" as never }), /finite number/);
	assert.throws(() => normalizeTaskSpawnOptions({ model: 5 as never }), /must be a string/);
});

test("classifyTaskResult maps child outcomes onto completed/failed/aborted", () => {
	assert.deepEqual(
		classifyTaskResult({ exitCode: 0, summary: "all done", responded: true }),
		{ kind: "completed", result: "all done" },
	);
	assert.deepEqual(
		classifyTaskResult({
			exitCode: 1,
			summary: "halfway",
			responded: true,
			errorMessage: "provider 529",
		}),
		{ kind: "failed", error: "provider 529", result: "halfway" },
	);
	const ping = classifyTaskResult({
		exitCode: 0,
		responded: true,
		summary: "need help",
		ping: { name: "w", message: "which repo?" },
	});
	assert.equal(ping.kind, "failed");
	assert.match((ping as { error: string }).error, /\(caller_ping\): which repo\?/);
	const aborted = classifyTaskResult({
		exitCode: 1,
		responded: true,
		summary: "partial",
		turnLimit: true,
		errorMessage: "turn limit exhausted",
	});
	assert.equal(aborted.kind, "aborted");
	assert.deepEqual(
		(classifyTaskResult({ exitCode: 2, responded: true }) as { error: string }),
		{ kind: "failed", error: "Task agent exited with code 2." },
	);
	assert.match(
		(classifyTaskResult({ exitCode: 0, responded: false }) as { error: string }).error,
		/without producing a final assistant message/,
	);
});

// ─────────────────────────────────────────────────────────────────────────────
// Spawn ordering, lifecycle finalization, stop, consume, shutdown
// ─────────────────────────────────────────────────────────────────────────────

test("spawn replies with the id before any terminal event, including an already-complete child", async () => {
	const harness = createHarness({
		// The child is already finished the moment the watch starts.
		async watch() {
			return { exitCode: 0, summary: "finished instantly", responded: true };
		},
	});
	const attached = await harness.attach();
	assert.ok(attached);

	const storedIds = new Set<string>();
	const data = await rpcCall<{ id: string }>(
		harness.bus.bus,
		"subagents:rpc:spawn",
		{ type: "general-purpose", prompt: "do the thing" },
		{
			onReply: (reply) => {
				harness.order.push("spawn-reply");
				storedIds.add(reply.id);
			},
		},
	);
	assert.match(data.id, /^run1$/);

	await waitFor(() => harness.completed.length === 1);
	// The reply listener stored the id before the completion event arrived.
	assert.deepEqual(harness.order, ["spawn-reply", "completed"]);
	const event = harness.completed[0];
	assert.equal(event.id, "run1");
	assert.equal(event.type, "general-purpose");
	assert.equal(event.result, "finished instantly");
	assert.equal(event.description, "general-purpose");
});

test("spawn validates through resolveAndLaunch before the pane is created and errors become envelopes", async () => {
	const harness = createHarness();
	const attached = await harness.attach({
		async resolveAndLaunch() {
			throw new Error('Unknown task agent type "Explroe".');
		},
	});
	assert.ok(attached);

	await assert.rejects(
		rpcCall(harness.bus.bus, "subagents:rpc:spawn", { type: "Explroe", prompt: "x" }),
		/Unknown task agent type "Explroe"/,
	);
	assert.equal(harness.hooks.launches.length, 0);
	assert.equal(harness.completed.length + harness.failed.length, 0);
});

test("spawn rejects unsupported safety-sensitive options before pane creation", async () => {
	const harness = createHarness();
	const attached = await harness.attach();
	assert.ok(attached);

	await assert.rejects(
		rpcCall(harness.bus.bus, "subagents:rpc:spawn", {
			type: "general-purpose",
			prompt: "x",
			options: { isolated: true },
		}),
		/does not support "isolated"/,
	);
	assert.equal(harness.hooks.launches.length, 0);
});

test("parallel runs settle independently through one lifecycle event each", async () => {
	const harness = createHarness();
	const attached = await harness.attach();
	assert.ok(attached);

	const ids: string[] = [];
	for (const prompt of ["a", "b"]) {
		const data = await rpcCall<{ id: string }>(harness.bus.bus, "subagents:rpc:spawn", {
			type: "general-purpose",
			prompt,
		});
		ids.push(data.id);
	}
	assert.equal(harness.hooks.launches.length, 2);

	// The second run finishes first: independence, not ordering.
	await settleRun(harness, "run2", { exitCode: 0, summary: "second done", responded: true });
	await waitFor(() => harness.completed.length === 1);
	assert.equal(harness.completed[0].id, "run2");
	assert.deepEqual(attached.bridge.activeIds(), ["run1"]);

	await settleRun(harness, "run1", { exitCode: 1, responded: true, summary: "boom", errorMessage: "oops" });
	await waitFor(() => harness.failed.length === 1);
	assert.equal(harness.failed[0].id, "run1");
	assert.equal(harness.failed[0].status, "failed");
});

test("terminal finalization emits exactly one lifecycle event under stop/watch/sidecar races", async () => {
	const harness = createHarness();
	const attached = await harness.attach();
	assert.ok(attached);

	const spawnReply = await rpcCall<{ id: string }>(harness.bus.bus, "subagents:rpc:spawn", {
		type: "general-purpose",
		prompt: "race",
	});
	const id = spawnReply.id;

	// Watch, stop, and a stray second finalization all race for the same run.
	// The child even finishes cleanly during the stop grace window — an
	// accepted stop must still publish exactly one `stopped` event with the
	// partial output, never a completion.
	const stopPromise = attached.bridge.stop(id);
	await settleRun(harness, id, { exitCode: 0, summary: "partial work before the stop", responded: true });
	await stopPromise;
	await waitFor(() => harness.completed.length + harness.failed.length === 1);

	assert.equal(harness.completed.length, 0, "an accepted stop never publishes completion");
	assert.equal(harness.failed.length, 1);
	assert.equal(harness.failed[0].status, "stopped");
	assert.equal(harness.failed[0].result, "partial work before the stop");

	// A duplicate finalize through the watch path must not publish again.
	await settleRun(harness, id, { exitCode: 0, summary: "late duplicate", responded: true });
	await new Promise((resolve) => setTimeout(resolve, 50));
	assert.equal(harness.completed.length, 0);
	assert.equal(harness.failed.length, 1);
});

test("stop rejects unknown and settled ids with the required errors", async () => {
	const harness = createHarness();
	const attached = await harness.attach();
	assert.ok(attached);

	await assert.rejects(attached.bridge.stop("nosuch"), /Agent not found/);

	const spawnReply = await rpcCall<{ id: string }>(harness.bus.bus, "subagents:rpc:spawn", {
		type: "general-purpose",
		prompt: "quick",
	});
	await settleRun(harness, spawnReply.id, { exitCode: 0, summary: "done", responded: true });
	await waitFor(() => harness.completed.length === 1);
	await assert.rejects(attached.bridge.stop(spawnReply.id), /Agent is not running/);
});

test("terminal stop sends Escape, flushes bounded, closes the pane, and preserves partial output", async () => {
	const harness = createHarness({ ...{} }, { stopFlushMs: 40 });
	const attached = await harness.attach();
	assert.ok(attached);

	const spawnReply = await rpcCall<{ id: string }>(harness.bus.bus, "subagents:rpc:spawn", {
		type: "general-purpose",
		prompt: "long task",
		options: { description: "Long task" },
	});
	const id = spawnReply.id;

	await attached.bridge.stop(id);
	await waitFor(() => harness.failed.length === 1);

	assert.deepEqual(harness.hooks.escapes, [id]);
	assert.deepEqual(harness.hooks.closedSurfaces, ["%1"]);
	const event = harness.failed[0];
	assert.equal(event.id, id);
	assert.equal(event.status, "stopped");
	assert.equal(event.result, "partial of run1");
	assert.equal(event.description, "Long task");
	// The run record keeps the stop intent for inspection.
	assert.equal(attached.bridge.getRecord(id)?.stopRequested, true);
	assert.equal(attached.bridge.getRecord(id)?.terminal?.status, "stopped");
});

test("consume fails while running and succeeds after settlement, without notifications", async () => {
	const harness = createHarness();
	const attached = await harness.attach();
	assert.ok(attached);

	const spawnReply = await rpcCall<{ id: string }>(harness.bus.bus, "subagents:rpc:spawn", {
		type: "general-purpose",
		prompt: "task",
	});
	await assert.rejects(
		rpcCall(harness.bus.bus, "subagents:rpc:consume", { agentId: spawnReply.id }),
		/Agent not found or still running/,
	);

	await settleRun(harness, spawnReply.id, { exitCode: 0, summary: "result text", responded: true });
	await waitFor(() => harness.completed.length === 1);

	await rpcCall(harness.bus.bus, "subagents:rpc:consume", { agentId: spawnReply.id });
	assert.equal(attached.bridge.getRecord(spawnReply.id)?.consumed, true);
	// No second completion turn: consuming never re-emits lifecycle events.
	assert.equal(harness.completed.length, 1);
});

test("consume rejects unknown ids", async () => {
	const harness = createHarness();
	const attached = await harness.attach();
	assert.ok(attached);
	await assert.rejects(
		rpcCall(harness.bus.bus, "subagents:rpc:consume", { agentId: "ghost" }),
		/Agent not found or still running/,
	);
});

test("settled records are retained for consumption within the configured bound (FIFO eviction)", async () => {
	const harness = createHarness({ ...{} }, { settledRetention: 2 });
	const attached = await harness.attach();
	assert.ok(attached);

	const ids: string[] = [];
	for (const n of [1, 2, 3]) {
		const reply = await rpcCall<{ id: string }>(harness.bus.bus, "subagents:rpc:spawn", {
			type: "general-purpose",
			prompt: `task ${n}`,
		});
		ids.push(reply.id);
	}
	for (const id of ids) {
		await settleRun(harness, id, { exitCode: 0, summary: `done ${id}`, responded: true });
	}
	await waitFor(() => harness.completed.length === 3);
	assert.equal(attached.bridge.settledCount(), 2);

	// The oldest settled record was evicted; the recent ones remain consumable.
	await assert.rejects(
		rpcCall(harness.bus.bus, "subagents:rpc:consume", { agentId: ids[0] }),
		/Agent not found or still running/,
	);
	await rpcCall(harness.bus.bus, "subagents:rpc:consume", { agentId: ids[1] });
	await rpcCall(harness.bus.bus, "subagents:rpc:consume", { agentId: ids[2] });
});

test("watch errors finalize once as failed instead of hanging the run", async () => {
	const harness = createHarness({
		async watch() {
			throw new Error("tmux server vanished");
		},
	});
	const attached = await harness.attach();
	assert.ok(attached);

	const spawnReply = await rpcCall<{ id: string }>(harness.bus.bus, "subagents:rpc:spawn", {
		type: "general-purpose",
		prompt: "doomed",
	});
	await waitFor(() => harness.failed.length === 1);
	assert.equal(harness.failed[0].id, spawnReply.id);
	assert.equal(harness.failed[0].status, "failed");
	assert.match(harness.failed[0].error as string, /tmux server vanished/);
});

test("shutdown terminates, finalizes, and clears every active adapter-owned run", async () => {
	const harness = createHarness();
	const attached = await harness.attach();
	assert.ok(attached);

	const spawnReply = await rpcCall<{ id: string }>(harness.bus.bus, "subagents:rpc:spawn", {
		type: "general-purpose",
		prompt: "still running",
	});
	assert.equal(attached.bridge.activeIds().length, 1);

	attached.bridge.shutdown();

	assert.deepEqual(harness.hooks.closedSurfaces, ["%1"]);
	assert.equal(attached.bridge.activeIds().length, 0);
	// Every active run settles through the finalizer exactly once: pi-tasks
	// keeps an in_progress task attached to the agent id and would otherwise
	// wait forever for a lifecycle event that never comes.
	assert.equal(harness.completed.length, 0);
	assert.equal(harness.failed.length, 1);
	assert.equal(harness.failed[0].id, spawnReply.id);
	assert.equal(harness.failed[0].status, "aborted");
	assert.match(harness.failed[0].error as string, /parent session shutdown/);
	// The task's partial output survives the termination.
	assert.equal(harness.failed[0].result, "partial of run1");
	// The aborted watcher must not publish a second event after shutdown.
	const control = harness.hooks.watchControls.get(spawnReply.id);
	control?.reject(new Error("Aborted"));
	await new Promise((resolve) => setTimeout(resolve, 50));
	assert.equal(harness.failed.length, 1);
	assert.equal(harness.completed.length, 0);

	await assert.rejects(
		rpcCall(harness.bus.bus, "subagents:rpc:consume", { agentId: spawnReply.id }, { timeoutMs: 150 }),
		/timeout|Agent not found/,
	);
});

test("a shutdown-terminated task is not reattached as live after a session reload", async () => {
	// Upstream pi-tasks persists in_progress tasks and reattaches their stored
	// agent ids on reload/resume, assuming a later lifecycle event settles
	// them. Simulate that contract: without the shutdown event, the reloaded
	// task would stay attached to a dead agent id forever (TaskOutput waits,
	// dependencies stay blocked, no retry).
	const harness = createHarness();
	const attached = await harness.attach();
	assert.ok(attached);

	// Upstream-style task record driven by the adapter's lifecycle events.
	const tasks = new Map<string, { status: string; agentId?: string }>();
	const spawnReply = await rpcCall<{ id: string }>(harness.bus.bus, "subagents:rpc:spawn", {
		type: "general-purpose",
		prompt: "long-running work",
	});
	tasks.set("task-1", { status: "in_progress", agentId: spawnReply.id });
	assert.equal(attached.bridge.activeIds().length, 1);

	attached.bridge.shutdown();

	// The aborted event settled the task: it is no longer in_progress.
	assert.equal(harness.failed.length, 1);
	assert.equal(harness.failed[0].status, "aborted");
	const task = tasks.get("task-1");
	assert.equal(task?.status, "in_progress");
	task.status = "failed"; // what the upstream listener does on subagents:failed

	// Reload/resume reattachment: an in_progress task is reattached as live
	// only while its agent id is still active on the provider.
	const reattachedAsLive = [...tasks.values()].filter(
		(entry) => entry.status === "in_progress" && attached.bridge.activeIds().includes(entry.agentId as string),
	);
	assert.deepEqual(reattachedAsLive, [], "a shutdown-terminated task must not reattach as live");
	assert.equal(attached.bridge.activeIds().length, 0);
});

test("a launch resolving after shutdown is closed and rejected, never registered", async () => {
	// Deferred-launch/shutdown race: pane creation is still in flight when the
	// bridge closes. The late handle must be closed immediately, the spawn must
	// fail, and nothing may be left active or watched (no-orphan contract).
	let releaseLaunch: (() => void) | undefined;
	const harness = createHarness();
	const attached = await harness.attach({
		async resolveAndLaunch(request) {
			await new Promise<void>((resolve) => {
				releaseLaunch = resolve;
			});
			const handle = await harness.hooks.launch({
				type: request.type,
				prompt: request.prompt,
				options: request.options,
				profile: {
					fileName: "general-purpose",
					source: "bundled",
					path: "/bundled/agents/general-purpose.md",
					name: "general-purpose",
					autoExit: true,
				},
				resolvedModel: {
					model: { provider: "p", id: "m" } as never,
					selection: { provider: "p", model: "m" },
					argument: "p/m",
					source: "parent",
				},
			});
			return {
				spec: {
					type: request.type,
					prompt: request.prompt,
					options: request.options,
					profile: {
						fileName: "general-purpose",
						source: "bundled" as const,
						path: "/bundled/agents/general-purpose.md",
						name: "general-purpose",
						autoExit: true,
					},
					resolvedModel: {
						model: { provider: "p", id: "m" } as never,
					selection: { provider: "p", model: "m" },
					argument: "p/m",
					source: "parent",
					},
				},
				handle,
			};
		},
	});
	assert.ok(attached);

	const spawnPromise = rpcCall(harness.bus.bus, "subagents:rpc:spawn", {
		type: "general-purpose",
		prompt: "races shutdown",
	});
	await waitFor(() => releaseLaunch !== undefined);

	// Parent-session shutdown lands while the pane is still being created.
	attached.bridge.shutdown();
	releaseLaunch?.();

	await assert.rejects(spawnPromise, /shut down while the task agent was launching/);
	assert.equal(attached.bridge.activeIds().length, 0);
	// The late pane was closed rather than registered and watched.
	assert.deepEqual(harness.hooks.closedSurfaces, ["%1"]);
	assert.equal(harness.hooks.watchControls.size, 0);
	assert.equal(harness.completed.length + harness.failed.length, 0);
});

test("createTaskRpcBridge works standalone with direct lifecycle callbacks", async () => {
	const events: string[] = [];
	const bridge = createTaskRpcBridge(
		{
			hooks: {
				async launch() {
					return { id: "direct1", surface: "%9", sessionFile: "/tmp/direct1.jsonl" };
				},
				async watch() {
					return { exitCode: 0, summary: "direct done", responded: true };
				},
				sendEscape() {},
				closeSurface() {},
				readPartialResult() {
					return undefined;
				},
			},
			async resolveAndLaunch(request) {
				return {
					spec: {
						type: request.type,
						prompt: request.prompt,
						options: request.options,
						profile: {
							fileName: "worker",
							source: "bundled",
							path: "/x",
							name: "worker",
							autoExit: true,
						},
						resolvedModel: {
							model: { provider: "p", id: "m" } as never,
							selection: { provider: "p", model: "m" },
							argument: "p/m",
							source: "parent",
						},
					},
					handle: { id: "direct1", surface: "%9", sessionFile: "/tmp/direct1.jsonl" },
				};
			},
			onLifecycle: (event) => events.push(event.kind),
		},
		{},
	);

	assert.deepEqual(bridge.ping(), { version: 2 });
	const { id } = await bridge.spawn({ type: "worker", prompt: "direct" });
	assert.equal(id, "direct1");
	await waitFor(() => events.length === 1);
	assert.deepEqual(events, ["completed"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Profile resolution (project > global > bundled, case, ambiguity, safety)
// ─────────────────────────────────────────────────────────────────────────────

function writeProfile(dir: string, fileName: string, frontmatter: string, body = "Do the work.") {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, `${fileName}.md`), `---\n${frontmatter}\n---\n\n${body}\n`);
}

function profileDirsFixture(run: (dirs: TaskAgentProfileDirs, root: string) => void): void {
	const root = mkdtempSync(join(tmpdir(), "pi-tasks-rpc-agents-"));
	try {
		run(
			{
				project: join(root, "project", ".pi", "agents"),
				global: join(root, "global", "agents"),
				bundled: join(root, "bundled", "agents"),
			},
			root,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

test("profile resolution prefers exact names with project > global > bundled precedence", () => {
	profileDirsFixture((dirs) => {
		writeProfile(dirs.bundled, "general-purpose", "name: general-purpose\nauto-exit: true");
		writeProfile(dirs.global, "general-purpose", "name: general-purpose\ndescription: global copy\nauto-exit: true");
		writeProfile(dirs.project, "general-purpose", "name: general-purpose\ndescription: project copy\nauto-exit: true");

		const resolved = resolveTaskAgentProfile("general-purpose", dirs);
		assert.equal(resolved.ok, true);
		assert.equal(resolved.ok && resolved.profile.source, "project");

		// Without the project copy the global one wins.
		rmSync(dirs.project, { recursive: true, force: true });
		const viaGlobal = resolveTaskAgentProfile("general-purpose", dirs);
		assert.ok(viaGlobal.ok);
		assert.equal(viaGlobal.profile.source, "global");
	});
});

test("profile resolution accepts one case-insensitive match in either direction", () => {
	profileDirsFixture((dirs) => {
		writeProfile(dirs.bundled, "Explore", "name: Explore\nauto-exit: true");
		for (const requested of ["Explore", "explore", "EXPLORE"]) {
			const resolved = resolveTaskAgentProfile(requested, dirs);
			assert.ok(resolved.ok, `${requested} should resolve`);
			assert.equal(resolved.profile.fileName, "Explore");
			assert.equal(resolved.profile.name, "Explore");
		}
	});
});

test("profile resolution rejects ambiguous case-insensitive matches with candidates", () => {
	profileDirsFixture((dirs) => {
		writeProfile(dirs.bundled, "Explore", "auto-exit: true");
		writeProfile(dirs.project, "explore", "auto-exit: true");
		const resolved = resolveTaskAgentProfile("EXPLORE", dirs);
		assert.equal(resolved.ok, false);
		assert.match(!resolved.ok && resolved.error, /Ambiguous task agent type "EXPLORE"/);
		assert.match(!resolved.ok && resolved.error, /project:explore/);
		assert.match(!resolved.ok && resolved.error, /bundled:Explore/);
	});
});

test("profile resolution rejects unknown names with the available list and never falls back", () => {
	profileDirsFixture((dirs) => {
		writeProfile(dirs.bundled, "worker", "auto-exit: true");
		writeProfile(dirs.bundled, "scout", "auto-exit: true");
		const resolved = resolveTaskAgentProfile("Explroe", dirs);
		assert.equal(resolved.ok, false);
		assert.match(!resolved.ok && resolved.error, /Unknown task agent type "Explroe"/);
		assert.match(!resolved.ok && resolved.error, /Available agent profiles: scout, worker/);
	});
});

test("profile resolution rejects interactive, non-auto-exit, and CLI profiles", () => {
	profileDirsFixture((dirs) => {
		writeProfile(dirs.bundled, "planner", "interactive: true\nauto-exit: false");
		writeProfile(dirs.bundled, "stubborn", "auto-exit: false");
		writeProfile(dirs.bundled, "claudeish", "cli: claude");
		writeProfile(dirs.bundled, "worker", "auto-exit: true");

		const interactive = resolveTaskAgentProfile("planner", dirs);
		assert.equal(interactive.ok, false);
		assert.match(!interactive.ok && interactive.error, /interactive: true/);

		const noAutoExit = resolveTaskAgentProfile("stubborn", dirs);
		assert.equal(noAutoExit.ok, false);
		assert.match(!noAutoExit.ok && noAutoExit.error, /auto-exit: false/);

		const cli = resolveTaskAgentProfile("claudeish", dirs);
		assert.equal(cli.ok, false);
		assert.match(!cli.ok && cli.error, /claude CLI/);

		assert.equal(resolveTaskAgentProfile("worker", dirs).ok, true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// Model resolution
// ─────────────────────────────────────────────────────────────────────────────

const MODELS = [
	{ provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
	{ provider: "anthropic", id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
	{ provider: "openai", id: "gpt-5.2", name: "GPT 5.2" },
	{ provider: "groq", id: "llama-3.3-70b", name: "Llama 3.3 70B" },
];

const registry = { getAvailable: () => MODELS };

test("model resolution accepts exact provider/modelId references", () => {
	const resolved = resolveTaskModelOverride("anthropic/claude-sonnet-4-5", registry);
	assert.equal(typeof resolved !== "string" && resolved.provider, "anthropic");
	assert.equal(typeof resolved !== "string" && resolved.id, "claude-sonnet-4-5");

	// Case-insensitive exact reference.
	const cased = resolveTaskModelOverride("Anthropic/Claude-Sonnet-4-5", registry);
	assert.equal(typeof cased !== "string" && cased.id, "claude-sonnet-4-5");
});

test("model resolution is fuzzy: short names, dot/dash versions, date stamps", () => {
	const byId = (input: string) => {
		const resolved = resolveTaskModelOverride(input, registry);
		assert.ok(typeof resolved !== "string", `${input} should resolve`);
		return resolved.id;
	};
	assert.equal(byId("sonnet"), "claude-sonnet-4-5");
	assert.equal(byId("haiku"), "claude-haiku-4-5");
	assert.equal(byId("claude-sonnet-4.5"), "claude-sonnet-4-5");
	assert.equal(byId("claude-sonnet-4-5-20251001"), "claude-sonnet-4-5");
	assert.equal(byId("GPT 5.2"), "gpt-5.2");
});

test("model resolution falls back to the same model on another provider", () => {
	const models = [
		{ provider: "proxy", id: "claude-sonnet-4-5", name: "Sonnet via proxy" },
		{ provider: "anthropic", id: "claude-haiku-4-5", name: "Haiku" },
	];
	const resolved = resolveTaskModelOverride("anthropic/claude-sonnet-4-5", {
		getAvailable: () => models,
	});
	assert.equal((resolved as { provider: string }).provider, "proxy");
});

test("model resolution fails with an actionable available-model list and never falls back", () => {
	const resolved = resolveTaskModelOverride("gemini-ultra", registry);
	assert.ok(typeof resolved === "string");
	assert.match(resolved, /Model not found: "gemini-ultra"/);
	assert.match(resolved, /anthropic\/claude-sonnet-4-5/);
	assert.match(resolved, /openai\/gpt-5\.2/);
});

function modelFixtureDirs(root: string): TaskAgentProfileDirs {
	return {
		project: join(root, "project", ".pi", "agents"),
		global: join(root, "global", "agents"),
		bundled: join(root, "bundled", "agents"),
	};
}

test("task model precedence: override beats configured, frontmatter, and parent", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-tasks-model-"));
	try {
		const dirs = modelFixtureDirs(root);
		writeProfile(dirs.bundled, "general-purpose", "model: anthropic/claude-haiku-4-5\nauto-exit: true");
		const profileResolution = resolveTaskAgentProfile("general-purpose", dirs);
		assert.ok(profileResolution.ok);
		const profile = profileResolution.profile;

		// 1. Explicit override wins over everything.
		const withOverride = resolveTaskLaunchModel({
			override: "sonnet",
			profile,
			ctx: { modelRegistry: registry, agentDir: join(root, "agentdir") },
		});
		assert.equal(withOverride.argument, "anthropic/claude-sonnet-4-5");
		assert.equal(withOverride.source, "explicit");

		// 4. Parent model when nothing else is configured.
		const parentOnly = resolveTaskLaunchModel({
			profile: { ...profile, model: undefined },
			ctx: {
				modelRegistry: registry,
				agentDir: join(root, "agentdir"),
				parentModel: { provider: "groq", id: "llama-3.3-70b", name: "Llama 3.3 70B" },
			},
		});
		assert.equal(parentOnly.argument, "groq/llama-3.3-70b");
		assert.equal(parentOnly.source, "parent");

		// 3. Profile frontmatter model when no config entry exists.
		const frontmatter = resolveTaskLaunchModel({
			profile,
			ctx: { modelRegistry: registry, agentDir: join(root, "agentdir") },
		});
		assert.equal(frontmatter.source, "agent");
		assert.equal(frontmatter.argument, "anthropic/claude-haiku-4-5");

		// 2. Configured agent-models.json entry beats frontmatter.
		const configDir = join(root, "configured");
		mkdirSync(configDir, { recursive: true });
		writeFileSync(
			join(configDir, "agent-models.json"),
			JSON.stringify({ version: 1, agents: { "general-purpose": "openai/gpt-5.2" } }),
		);
		const configured = resolveTaskLaunchModel({
			profile,
			ctx: { modelRegistry: registry, agentDir: configDir },
		});
		assert.equal(configured.source, "configured");
		assert.equal(configured.argument, "openai/gpt-5.2");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("task model resolution hard-fails when an explicit override is unresolvable", () => {
	const root = mkdtempSync(join(tmpdir(), "pi-tasks-model-fail-"));
	try {
		const dirs = modelFixtureDirs(root);
		writeProfile(dirs.bundled, "general-purpose", "auto-exit: true");
		const resolved = resolveTaskAgentProfile("general-purpose", dirs);
		assert.ok(resolved.ok);
		assert.throws(
			() =>
				resolveTaskLaunchModel({
					override: "no-such-model",
					profile: resolved.profile,
					ctx: {
						modelRegistry: registry,
						agentDir: join(root, "agentdir"),
						parentModel: { provider: "groq", id: "llama-3.3-70b", name: "Llama 3.3 70B" },
					},
				}),
			/Model not found: "no-such-model"/,
		);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

// ─────────────────────────────────────────────────────────────────────────────
// Bundled compatibility profiles (T6)
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve against the real bundled agents dir with no project/global shadowing. */
function bundledOnlyDirs(): TaskAgentProfileDirs {
	const bundled = join(dirname(fileURLToPath(import.meta.url)), "agents");
	return {
		project: join(tmpdir(), `pi-tasks-none-project-${process.pid}`),
		global: join(tmpdir(), `pi-tasks-none-global-${process.pid}`),
		bundled,
	};
}

test("bundled compatibility profiles resolve regardless of input case", () => {
	const dirs = bundledOnlyDirs();
	for (const [requested, fileName] of [
		["general-purpose", "general-purpose"],
		["GENERAL-PURPOSE", "general-purpose"],
		["General-Purpose", "general-purpose"],
		["Explore", "Explore"],
		["explore", "Explore"],
		["EXPLORE", "Explore"],
		["Plan", "Plan"],
		["plan", "Plan"],
	] as const) {
		const resolved = resolveTaskAgentProfile(requested, dirs);
		assert.ok(resolved.ok, `${requested} should resolve`);
		assert.equal(resolved.profile.fileName, fileName);
		assert.equal(resolved.profile.source, "bundled");
	}
});

test("bundled compatibility profiles are autonomous, auto-exiting, and cannot spawn nested agents", () => {
	const dirs = bundledOnlyDirs();
	for (const name of ["general-purpose", "Explore", "Plan"]) {
		const resolved = resolveTaskAgentProfile(name, dirs);
		assert.ok(resolved.ok);
		assert.equal(resolved.profile.interactive, false, name);
		assert.equal(resolved.profile.autoExit, true, name);
		assert.equal(resolved.profile.cli, undefined, name);
	}
	// Denied tools prove nested spawning is unavailable through the launch
	// controls, not just the prompt.
	for (const name of ["general-purpose", "Explore", "Plan"]) {
		const defs = indexTestApi.loadAgentDefaults(name);
		assert.ok(defs, name);
		assert.equal(defs?.spawning, false, name);
		const denied = indexTestApi.resolveDenyTools(defs);
		for (const tool of ["subagent", "subagent_interrupt", "subagents_list", "subagent_resume", "subagent_recover"]) {
			assert.equal(denied.has(tool), true, `${name} must deny ${tool}`);
		}
	}
});

test("bundled Explore and Plan enforce read-only tool allowlists, not prompt text alone", () => {
	const dirs = bundledOnlyDirs();
	// Every tool that can mutate the filesystem or spawn a process: a shell
	// can rm/mv/redirect, so read-only must mean no bash at all.
	const mutationTools = ["bash", "powershell", "write", "edit", "apply_patch", "lsp_rename", "subagent"];
	const readOnlyTools = ["read", "grep", "find", "ls"];
	for (const name of ["Explore", "Plan"]) {
		const resolved = resolveTaskAgentProfile(name, dirs);
		assert.ok(resolved.ok);
		assert.ok(resolved.profile.tools, `${name} must declare a tools allowlist`);
		const allowed = new Set(
			resolved.profile.tools!.split(",").map((entry) => entry.trim()).filter(Boolean),
		);
		for (const tool of readOnlyTools) {
			assert.equal(allowed.has(tool), true, `${name} allows ${tool}`);
		}
		for (const tool of mutationTools) {
			assert.equal(allowed.has(tool), false, `${name} must not allow ${tool}`);
		}
		// The effective launch allowlist — the child's --tools argument, i.e.
		// the runtime enforcement boundary — admits only the read-only set
		// plus the child control tools (caller_ping, subagent_done). A
		// filesystem mutation is not merely discouraged: the child process
		// has no tool that can perform it.
		const launchAllowlist = indexTestApi.buildSubagentToolAllowlist(resolved.profile.tools);
		assert.ok(launchAllowlist);
		const launchSet = new Set(launchAllowlist!.split(","));
		for (const tool of [...readOnlyTools, "caller_ping", "subagent_done"]) {
			assert.equal(launchSet.has(tool), true, `${name} launch set must contain ${tool}`);
		}
		for (const tool of mutationTools) {
			assert.equal(launchSet.has(tool), false, `${name} launch set must not contain ${tool}`);
		}
		// The negative check, concretely: none of the mutation-capable tool
		// names survives into the argument the child runtime receives.
		const launchArgs = launchAllowlist!.split(",");
		assert.equal(
			launchArgs.some((tool) => mutationTools.includes(tool)),
			false,
			`${name} child cannot be handed a mutation tool`,
		);
	}

	// general-purpose keeps ordinary write tools and only loses nesting.
	const general = resolveTaskAgentProfile("general-purpose", dirs);
	assert.ok(general.ok);
	assert.equal(general.profile.tools, undefined);
});

test("existing autonomous workflow profiles stay eligible through the task resolver", () => {
	const dirs = bundledOnlyDirs();
	for (const name of ["worker", "scout", "implementer", "reviewer"]) {
		const resolved = resolveTaskAgentProfile(name, dirs);
		assert.ok(resolved.ok, `${name} should stay eligible`);
		assert.notEqual(resolved.profile.interactive, true, name);
		assert.notEqual(resolved.profile.autoExit, false, name);
		assert.equal(resolved.profile.cli, undefined, name);
	}
	// The interactive planner and CLI agent stay ineligible.
	assert.equal(resolveTaskAgentProfile("planner", dirs).ok, false);
	assert.equal(resolveTaskAgentProfile("claude-code", dirs).ok, false);
});
