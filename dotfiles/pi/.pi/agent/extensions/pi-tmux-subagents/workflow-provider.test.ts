import assert from "node:assert/strict";
import test from "node:test";
import { hashText, type LaunchProfile, type LaunchProfileWorkflowMetadata } from "./launch-profile.ts";
import { attachTmuxWorkflowProvider } from "./workflow-provider.ts";
import {
	discoverWorkflowProviders,
	requestWorkflowProvider,
	subscribeWorkflowDelivery,
	WORKFLOW_PROVIDER_CANCEL_CHANNEL,
	WORKFLOW_PROVIDER_REQUEST_CHANNEL,
	WORKFLOW_PROVIDER_CAPABILITIES,
	type WorkflowOwner,
} from "../workflow-provider/contract.ts";
import type { RunningSubagent, SubagentResult, ResumeLifecycleContext, ResumeRecoveryContext } from "./subagent-services.ts";

function bus() {
	const handlers = new Map<string, Set<(value: unknown) => void>>();
	return {
		on(channel: string, handler: (value: unknown) => void) {
			const set = handlers.get(channel) ?? new Set();
			set.add(handler);
			handlers.set(channel, set);
			return () => set.delete(handler);
		},
		emit(channel: string, value: unknown) {
			for (const handler of [...(handlers.get(channel) ?? [])]) handler(value);
		},
		size() { return [...handlers.values()].reduce((count, set) => count + set.size, 0); },
	};
}

const owner: WorkflowOwner = { sessionId: "parent", runId: "run", roleId: "writer", ownershipId: "lease" };
const metadata: LaunchProfileWorkflowMetadata = {
	version: 1, workflowId: "test", runId: "run", roleId: "writer",
	manifestHash: "a".repeat(64), skillHash: "b".repeat(64),
	policy: "per-role", assignmentSource: "parent", projectRoot: "/repo", data: {},
};
const profile = {
	version: 1,
	stable: {
		agentName: "writer", displayName: "Writer", roleBody: "Write",
		roleBodyHash: hashText("Write"), systemPromptMode: "append", cwd: "/repo",
		agentDir: "/agents", controls: { denyTools: [], interactive: false, sessionMode: "standalone" },
		originalSessionPath: "/sessions/writer.jsonl", createdAt: new Date().toISOString(),
	},
	runtime: { originalModel: { provider: "test", model: "echo" }, lastModel: { provider: "test", model: "echo" }, resumeCount: 0 },
	resources: { tools: { hash: "0".repeat(64), count: 0 }, visibleSkills: { hash: "0".repeat(64), count: 0 }, updatedAt: new Date().toISOString() },
	workflow: metadata,
} satisfies LaunchProfile;
const agent = { agentId: "writer", path: "/agents/writer.md", hash: "c".repeat(64), roleBodyHash: hashText("Write") };
const running = { id: "pane", name: "Writer", task: "Write", sessionFile: "/sessions/writer.jsonl", surface: "pane", startTime: 1, statusState: {} as RunningSubagent["statusState"], interactive: false } satisfies RunningSubagent;

function fixture() {
	const events = bus();
	const sidecars = new Map<string, LaunchProfile>([[running.sessionFile, profile]]);
	const calls: string[] = [];
	let available = true;
	let updateFails = false;
	let modelUpdateFails = false;
	let silentUpdate = false;
	let stopFails = false;
	let pickedModel: string | undefined;
	let resumedLifecycle: ResumeLifecycleContext | undefined;
	let resumedRecovery: ResumeRecoveryContext | undefined;
	let watched: ((value: SubagentResult) => void) | undefined;
	const attached = attachTmuxWorkflowProvider({
		events, sessionId: owner.sessionId,
		isAvailable: () => available,
		resolveProfile: (id) => id === "writer" ? agent : null,
		readProfile: (path) => sidecars.get(path) ?? null,
		updateProfile: (path, workflow) => {
			calls.push("update");
			if (updateFails) throw new Error("disk is read only");
			if (!silentUpdate) sidecars.set(path, { ...sidecars.get(path)!, workflow });
		},
		recordLaunchedModel: (path, selection) => {
			if (modelUpdateFails) throw new Error("model sidecar is read only");
			const saved = sidecars.get(path)!;
			sidecars.set(path, { ...saved, runtime: { ...saved.runtime, lastModel: selection } });
		},
		estimateContext: () => ({ tokens: 123, source: "conservative" }),
		captureEvidence: () => ({ changedFiles: [] }),
		finishEvidence: () => ({ changedFiles: ["src/main.ts"] }),
		services: {
			async launchSubagent(params, _ctx, options) {
				calls.push("launch");
				assert.equal(params.agent, "writer");
				assert.deepEqual(options?.workflow, metadata);
				return running;
			},
			async executeSubagentResume(_pi, params, _ctx, _recovery, lifecycle) {
				calls.push("resume");
				resumedLifecycle = lifecycle;
				resumedRecovery = _recovery;
				const selected = params.model?.split("/");
				lifecycle?.onLaunched?.({
					running, replacement: false, originalSessionPath: params.sessionPath, sessionPath: params.sessionPath,
					selection: pickedModel ? { provider: "test", model: pickedModel }
						: selected?.length === 2 ? { provider: selected[0], model: selected[1] } : profile.runtime.lastModel,
					userSelectedModel: !!pickedModel,
				});
				return { content: [{ type: "text" as const, text: "Session resumed" }], details: { status: "started", sessionPath: params.sessionPath } };
			},
			async watchSubagent(_running, signal) {
				return new Promise<SubagentResult>((resolve) => {
					watched = resolve;
					signal.addEventListener("abort", () => resolve({
						name: "Writer", task: "Write", summary: "cancelled", sessionFile: running.sessionFile, exitCode: 1, elapsed: 0,
					}), { once: true });
				});
			},
			stopSubagent() { calls.push("stop"); if (stopFails) throw new Error("pane could not close"); },
		},
		ctx: { cwd: "/repo", model: undefined, modelRegistry: { getAvailable: () => [{ provider: "test", id: "echo" }, { provider: "test", id: "next" }] } as never,
			sessionManager: { getSessionId: () => "parent", getSessionFile: () => "/parent.jsonl", getSessionDir: () => "/sessions" } },
		pi: { sendMessage() {} },
	});
	assert.ok(attached);
	return { events, attached, calls, sidecars, get watched() { return watched; },
		setAvailable(value: boolean) { available = value; }, failUpdate() { updateFails = true; },
		failModelUpdate() { modelUpdateFails = true; },
		pickModel(value: string) { pickedModel = value; },
		async completeResume(result: SubagentResult, successfulModel?: string) {
			if (successfulModel) await resumedRecovery?.onSuccessfulResponse?.({ provider: "test", model: successfulModel });
			await resumedLifecycle?.onResult?.({ result, replacement: false,
				originalSessionPath: running.sessionFile, sessionPath: running.sessionFile });
		},
		ignoreUpdate() { silentUpdate = true; }, failStop(value: boolean) { stopFails = value; } };
}

const launch = { agentId: "writer", name: "Writer", task: "Write", workflow: metadata, model: { provider: "test", model: "echo" }, repositoryRoot: "/repo" };
const expected = { agentId: "writer", profileHash: agent.hash, model: { provider: "test", model: "echo" } };

test("root discovery, launch acknowledgement, correlated lifecycle and evidence", { timeout: 3_000 }, async () => {
	const f = fixture();
	assert.deepEqual((await discoverWorkflowProviders(f.events, { timeoutMs: 5 })).map((item) => item.providerId), ["pi-tmux-subagents"]);
	assert.deepEqual(f.attached.identity.capabilities, WORKFLOW_PROVIDER_CAPABILITIES);
	const reply = await requestWorkflowProvider(f.events, f.attached.identity, "launch", owner, launch);
	assert.equal(reply.data.profile.hash, agent.hash);
	assert.equal(reply.data.metadataConfirmed, true);
	const delivered: unknown[] = [];
	let finish!: () => void;
	const finished = new Promise<void>((resolve) => { finish = resolve; });
	subscribeWorkflowDelivery(f.events, f.attached.identity, owner, reply.requestId, (value) => {
		delivered.push(value);
		if (value.kind === "result") finish();
	}, { sessionPath: running.sessionFile });
	f.watched?.({ name: "Writer", task: "Write", summary: "done", sessionFile: running.sessionFile, exitCode: 0, elapsed: 1 });
	await finished;
	assert.deepEqual(delivered.map((item) => (item as { result: unknown }).result),
		[{ sessionPath: running.sessionFile, status: "completed", message: "done", changedFiles: ["src/main.ts"], stopRequired: true }]);
	f.attached.detach();
	assert.equal(f.events.size(), 0);
});

test("terminal child ping carries evidence and then settles the owned role", { timeout: 3_000 }, async () => {
	const f = fixture();
	const ack = await requestWorkflowProvider(f.events, f.attached.identity, "launch", owner, launch);
	const received: unknown[] = [];
	let finish!: () => void;
	const finished = new Promise<void>((resolve) => { finish = resolve; });
	subscribeWorkflowDelivery(f.events, f.attached.identity, owner, ack.requestId,
		(value) => { received.push(value); if (value.kind === "result") finish(); }, { sessionPath: running.sessionFile });
	f.watched?.({ name: "Writer", task: "Write", summary: "needs help", sessionFile: running.sessionFile,
		exitCode: 0, elapsed: 1, ping: { name: "Writer", message: "Question?" } });
	await finished;
	assert.deepEqual(received.map((value) => {
		const { kind, message, changedFiles } = value as { kind: string; message: string; changedFiles: string[] };
		return { kind, message, changedFiles };
	}), [
		{ kind: "ping", message: "Question?", changedFiles: ["src/main.ts"] },
		{ kind: "result", message: undefined, changedFiles: undefined },
	]);
	assert.deepEqual((received[1] as { result: { status: string; changedFiles: string[] } }).result,
		{ sessionPath: running.sessionFile, status: "failed", message: "needs help", changedFiles: ["src/main.ts"], stopRequired: true });
	f.attached.detach();
});

test("a watcher that failed to close its pane stays owned for a strict stop", async () => {
	const f = fixture();
	await requestWorkflowProvider(f.events, f.attached.identity, "launch", owner, launch);
	f.watched?.({ name: "Writer", task: "Write", summary: "pane close failed",
		sessionFile: running.sessionFile, exitCode: 1, elapsed: 1, error: "pane close failed" });
	await new Promise((resolve) => setImmediate(resolve));
	assert.deepEqual((await requestWorkflowProvider(f.events, f.attached.identity, "stop", owner,
		{ sessionPath: running.sessionFile })).data, { stopped: true });
	assert.equal(f.calls.includes("stop"), true);
	f.attached.detach();
});

test("saved identity, metadata write/readback, context and model facts fail closed", async () => {
	const f = fixture();
	for (const payload of [
		{ sessionPath: running.sessionFile, expected: { ...expected, profileHash: "wrong" }, workflow: metadata, repositoryRoot: "/repo" },
		{ sessionPath: running.sessionFile, expected: { ...expected, model: { provider: "test", model: "wrong" } }, workflow: metadata, repositoryRoot: "/repo" },
	]) {
		await assert.rejects(requestWorkflowProvider(f.events, f.attached.identity, "resume", owner, payload), /identity|model/i);
	}
	f.failUpdate();
	await assert.rejects(requestWorkflowProvider(f.events, f.attached.identity, "recover", owner,
		{ sessionPath: running.sessionFile, expected, workflow: metadata, repositoryRoot: "/repo",
			model: expected.model, failure: "credits exhausted" }), /metadata|disk/i);
	assert.equal(f.calls.includes("resume"), false);
	f.attached.detach();
});

test("resume returns actual saved context/model and acknowledges updated metadata before invoking service", async () => {
	const f = fixture();
	const response = await requestWorkflowProvider(f.events, f.attached.identity, "resume", owner, {
		sessionPath: running.sessionFile, expected: { ...expected, contextTokens: 123 },
		workflow: metadata, repositoryRoot: "/repo",
	});
	assert.equal(response.data.context.tokens, 123);
	assert.deepEqual(response.data.model, expected.model);
	assert.deepEqual(f.calls, ["update", "resume"]);
	f.attached.detach();
});

test("recovery forwards classified failure and an explicit validated replacement model", async () => {
	const f = fixture();
	await assert.rejects(requestWorkflowProvider(f.events, f.attached.identity, "recover", owner, {
		sessionPath: running.sessionFile, expected, workflow: metadata, repositoryRoot: "/repo",
		failure: "credits exhausted", model: { provider: "test", model: "missing" },
	}), /model/i);
	f.attached.detach();
});

test("recovery delivery carries only the service-confirmed successful response evidence", { timeout: 3_000 }, async () => {
	for (const outcome of ["response", "no-output", "ping", "failed", "wrong-model"]) {
		const f = fixture();
		try {
			const ack = await requestWorkflowProvider(f.events, f.attached.identity, "recover", owner, {
				sessionPath: running.sessionFile, expected, workflow: metadata, repositoryRoot: "/repo",
				model: { provider: "test", model: "next" }, failure: "credits exhausted",
			});
			const delivered = new Promise<any>((resolve) => subscribeWorkflowDelivery(f.events, f.attached.identity, owner,
				ack.requestId, (value) => { if (value.kind === "result") resolve(value.result); }, { sessionPath: running.sessionFile }));
			await f.completeResume({
				name: "Writer", task: "Write", summary: "finished", sessionFile: running.sessionFile,
				exitCode: outcome === "failed" ? 1 : 0, elapsed: 1,
				...(outcome === "ping" ? { ping: { name: "Writer", message: "Question?" } } : {}),
			}, outcome === "response" ? "next" : outcome === "wrong-model" ? "echo" : undefined);
			assert.equal((await delivered).successfulResponse === true, outcome === "response", outcome);
		} finally { f.attached.detach(); }
	}
});

test("the context gate can change a saved model only with explicit picker permission and persisted facts", async () => {
	for (const operation of ["resume", "recover"] as const) for (const allowed of [false, true]) {
		const f = fixture();
		f.pickModel("next");
		const result = requestWorkflowProvider(f.events, f.attached.identity, operation, owner, {
			sessionPath: running.sessionFile, expected, workflow: metadata, repositoryRoot: "/repo",
			allowUserModelSelection: allowed, ...(operation === "recover" ? { model: expected.model, failure: "credits exhausted" } : {}),
		});
		try {
			if (!allowed) await assert.rejects(result, /model.*mismatch|model.*confirmed/i);
			else {
				const { data } = await result;
				assert.deepEqual(data.model, { provider: "test", model: "next" });
				assert.equal(data.userSelectedModel, true);
				assert.deepEqual(f.sidecars.get(running.sessionFile)?.runtime.lastModel, data.model);
				if (operation === "recover") assert.deepEqual(f.sidecars.get(running.sessionFile)?.workflow?.currentDefault, data.model);
			}
		} finally { f.attached.detach(); }
	}
});

test("replacement model cannot be acknowledged without matching persisted sidecar facts", async () => {
	const f = fixture();
	const replacement = { provider: "test", model: "next" };
	f.failModelUpdate();
	await assert.rejects(requestWorkflowProvider(f.events, f.attached.identity, "recover", owner, {
		sessionPath: running.sessionFile, expected, workflow: metadata, repositoryRoot: "/repo",
		failure: "credits exhausted", model: replacement,
	}), /model sidecar is read only/i);
	assert.equal(f.calls.includes("resume"), true, "the replacement model must reach the launched service");
	assert.equal(f.calls.includes("stop"), true, "an unconfirmed role must be stopped");
	f.attached.detach();
});

test("resume and recovery retain ownership when model confirmation and cleanup both fail", { timeout: 3_000 }, async () => {
	const outcomes = [];
	for (const operation of ["resume", "recover"] as const) {
		const f = fixture();
		try {
			f.failModelUpdate();
			f.failStop(true);
			const payload = {
				sessionPath: running.sessionFile, expected, workflow: metadata, repositoryRoot: "/repo",
				...(operation === "recover" ? { failure: "credits exhausted", model: { provider: "test", model: "next" } } : {}),
			};
			const [confirmation] = await Promise.allSettled([
				requestWorkflowProvider(f.events, f.attached.identity, operation, owner, payload),
			]);
			assert.equal(confirmation.status, "rejected", `${operation}: unconfirmed model facts must not be acknowledged`);
			assert.deepEqual(f.calls, ["update", "resume", "stop"], `${operation}: the child launched and cleanup was attempted`);

			const [duplicate] = await Promise.allSettled([
				requestWorkflowProvider(f.events, f.attached.identity, operation, owner, payload),
			]);
			const callsBeforeRetry = [...f.calls];
			f.failStop(false);
			const [retry] = await Promise.allSettled([
				requestWorkflowProvider(f.events, f.attached.identity, "stop", owner, { sessionPath: running.sessionFile }),
			]);
			outcomes.push({ operation, confirmation, duplicate, retry, callsBeforeRetry, callsAfterRetry: [...f.calls] });
		} finally { f.attached.detach(); }
	}
	for (const { operation, confirmation, duplicate, retry, callsBeforeRetry, callsAfterRetry } of outcomes) {
		assert.deepEqual({
			childStarts: callsBeforeRetry.filter((call) => call === "resume").length,
			cleanupAttempts: callsBeforeRetry.filter((call) => call === "stop").length,
			stopRetry: retry.status === "fulfilled" ? retry.value.data : String(retry.reason),
		}, {
			childStarts: 1,
			cleanupAttempts: 1,
			stopRetry: { stopped: true },
		}, `${operation}: failed cleanup must retain ownership, refuse duplicate execution and allow an owned stop retry`);
		assert.equal(duplicate.status, "rejected", `${operation}: the already-owned session cannot execute again`);
		assert.equal(callsAfterRetry.filter((call) => call === "stop").length, 2, `${operation}: the retry must stop the child`);
		if (confirmation.status === "rejected") {
			assert.match(String(confirmation.reason), /model sidecar is read only/i);
			assert.match(String(confirmation.reason), /pane could not close/i);
		}
	}
});

test("replacement model acknowledgement reads back the launched selection", async () => {
	const f = fixture();
	const replacement = { provider: "test", model: "next" };
	const response = await requestWorkflowProvider(f.events, f.attached.identity, "recover", owner, {
		sessionPath: running.sessionFile, expected, workflow: metadata, repositoryRoot: "/repo",
		failure: "credits exhausted", model: replacement,
	});
	assert.deepEqual(response.data.model, replacement);
	assert.deepEqual(f.sidecars.get(running.sessionFile)?.runtime.lastModel, replacement);
	f.attached.detach();
});
test("missing repository evidence cannot launch a role", async () => {
	const f = fixture();
	await assert.rejects(requestWorkflowProvider(f.events, f.attached.identity, "launch", owner,
		{ ...launch, repositoryRoot: "" }), /repository/i);
	assert.deepEqual(f.calls, []);
	f.attached.detach();
});

test("unchanged sidecar readback cannot count as a confirmed metadata update", async () => {
	const f = fixture();
	f.sidecars.set(running.sessionFile, { ...profile, workflow: { ...metadata, data: { old: "value" } } });
	f.ignoreUpdate();
	await assert.rejects(requestWorkflowProvider(f.events, f.attached.identity, "resume", owner, {
		sessionPath: running.sessionFile, expected, workflow: metadata, repositoryRoot: "/repo",
	}), /confirmed/);
	assert.equal(f.calls.includes("resume"), false);
	f.attached.detach();
});

test("duplicate claim abstains and provider loss suppresses stale completion", async () => {
	const f = fixture();
	assert.equal(attachTmuxWorkflowProvider({ ...({} as object), events: f.events,
		sessionId: owner.sessionId, isAvailable: () => true } as never), null);
	const response = await requestWorkflowProvider(f.events, f.attached.identity, "launch", owner, launch);
	const delivered: unknown[] = [];
	subscribeWorkflowDelivery(f.events, f.attached.identity, owner, response.requestId,
		(value) => delivered.push(value), { sessionPath: running.sessionFile });
	f.setAvailable(false);
	await assert.rejects(requestWorkflowProvider(f.events, f.attached.identity, "ping", owner, {}), /unavailable/);
	f.setAvailable(true);
	f.watched?.({ name: "Writer", task: "Write", summary: "late", sessionFile: running.sessionFile, exitCode: 0, elapsed: 1 });
	await new Promise((resolve) => setTimeout(resolve, 15));
	assert.deepEqual(delivered, []);
	f.attached.detach();
});

test("cancelled launch refuses late acknowledgement and stops its pane", async () => {
	const f = fixture();
	const abort = new AbortController();
	const pending = requestWorkflowProvider(f.events, f.attached.identity, "launch", owner, launch, { signal: abort.signal });
	abort.abort();
	await assert.rejects(pending, /cancelled/);
	await new Promise((resolve) => setTimeout(resolve, 0));
	assert.equal(f.calls.filter((call) => call === "stop").length, 1);
	f.attached.detach();
});

test("a forged cancel for a different role owner cannot revoke an in-flight launch", async () => {
	const f = fixture();
	const off = f.events.on(WORKFLOW_PROVIDER_REQUEST_CHANNEL, (value) => {
		const request = value as { requestId: string };
		f.events.emit(WORKFLOW_PROVIDER_CANCEL_CHANNEL, { ...value as object,
			owner: { ...owner, ownershipId: "stale" }, requestId: request.requestId });
	});
	const ack = await requestWorkflowProvider(f.events, f.attached.identity, "launch", owner, launch, { timeoutMs: 25 });
	assert.equal(ack.data.accepted, true);
	off();
	f.attached.detach();
});

test("owned stop, cancellation, provider loss and duplicate/child claims", async () => {
	const f = fixture();
	const reply = await requestWorkflowProvider(f.events, f.attached.identity, "launch", owner, launch);
	await assert.rejects(requestWorkflowProvider(f.events, f.attached.identity, "stop",
		{ ...owner, ownershipId: "wrong" }, { sessionPath: running.sessionFile }), /ownership|owned/i);
	f.failStop(true);
	await assert.rejects(requestWorkflowProvider(f.events, f.attached.identity, "stop", owner,
		{ sessionPath: running.sessionFile }), /pane could not close/);
	f.failStop(false);
	assert.deepEqual((await requestWorkflowProvider(f.events, f.attached.identity, "stop", owner,
		{ sessionPath: running.sessionFile })).data, { stopped: true });
	assert.equal(f.calls.filter((call) => call === "stop").length, 2);
	assert.equal(reply.data.sessionPath, running.sessionFile);
	f.setAvailable(false);
	await assert.rejects(requestWorkflowProvider(f.events, f.attached.identity, "ping", owner, {}), /unavailable/i);
	assert.equal(attachTmuxWorkflowProvider({ ...({} as object), events: f.events, sessionId: "child", env: { PI_SUBAGENT_ID: "child" } } as never), null);
	f.attached.detach();
});
