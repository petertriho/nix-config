import assert from "node:assert/strict";
import test from "node:test";
import {
	discoverWorkflowProviders, requestWorkflowProvider, subscribeWorkflowDelivery,
	isWorkflowProviderOperation, WorkflowProviderCleanupRequiredError,
	WORKFLOW_PROVIDER_CAPABILITIES, WORKFLOW_PROVIDER_VERSION,
	type WorkflowLaunchRequest, type WorkflowSavedRequest,
} from "../adapters/workflow-contract.ts";

type Handler = (data: unknown) => void;

const workflow = {
	version: 1, workflowId: "test", runId: "run-1", roleId: "writer",
	manifestHash: "manifest", skillHash: "skill", policy: "per-role",
	assignmentSource: "parent", projectRoot: "/repo", data: {},
};
const launchPayload: WorkflowLaunchRequest = {
	agentId: "writer", name: "Writer", task: "Write", workflow, repositoryRoot: "/repo",
	model: { provider: "test", model: "echo" },
};
const savedPayload: WorkflowSavedRequest = {
	sessionPath: "/tmp/role.jsonl", expected: { agentId: "writer", profileHash: "hash" },
	workflow, repositoryRoot: "/repo",
};

test("operation ingress accepts only the eight version 1 operation names", () => {
	for (const operation of ["ping", "profiles", "inspect", "launch", "resume", "recover", "stop", "update-metadata"]) {
		assert.equal(isWorkflowProviderOperation(operation), true);
	}
	for (const value of [undefined, null, 1, {}, ["launch"], "constructor", "toString", "cancel", "recovery"]) {
		assert.equal(isWorkflowProviderOperation(value), false);
	}
});

function fakeEvents() {
	const listeners = new Map<string, Set<Handler>>();
	return {
		on(channel: string, handler: Handler) {
			const handlers = listeners.get(channel) ?? new Set<Handler>();
			handlers.add(handler);
			listeners.set(channel, handlers);
			return () => handlers.delete(handler);
		},
		emit(channel: string, data: unknown) {
			for (const handler of [...(listeners.get(channel) ?? [])]) handler(data);
		},
	};
}

test("discovery retains every compatible provider, never accepting absent or incomplete providers", async () => {
	const events = fakeEvents();
	const absent = await discoverWorkflowProviders(events, { timeoutMs: 5 });
	assert.deepEqual(absent, []);
	events.on("pi-workflows:provider:discover", (data) => {
		const { requestId } = data as { requestId: string };
		for (const provider of [
			{ providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES },
			{ providerId: "broken", instanceId: "two", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: ["launch"] },
			{ providerId: "old", instanceId: "three", version: WORKFLOW_PROVIDER_VERSION - 1, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES },
			{ providerId: "beta", instanceId: "four", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES },
		]) events.emit(`pi-workflows:provider:discover:reply:${requestId}`, { requestId, ...provider });
	});
	const providers = await discoverWorkflowProviders(events, { timeoutMs: 5 });
	assert.deepEqual(providers.map(({ providerId }) => providerId), ["alpha", "beta"]);
});

test("bounded discovery observes a provider registering after the first probe", async () => {
	const events = fakeEvents();
	const pending = discoverWorkflowProviders(events, { timeoutMs: 90 });
	setTimeout(() => events.on("pi-workflows:provider:discover", (value) => {
		const { requestId } = value as { requestId: string };
		events.emit(`pi-workflows:provider:discover:reply:${requestId}`, {
			requestId, providerId: "late", instanceId: "fresh", ready: true,
			version: WORKFLOW_PROVIDER_VERSION, capabilities: WORKFLOW_PROVIDER_CAPABILITIES,
		});
	}), 10);
	assert.deepEqual((await pending).map(({ providerId }) => providerId), ["late"]);
});

test("aborting discovery discards compatible announcements already collected", async () => {
	const events = fakeEvents();
	const controller = new AbortController();
	events.on("pi-workflows:provider:discover", (data) => {
		const { requestId } = data as { requestId: string };
		events.emit(`pi-workflows:provider:discover:reply:${requestId}`, {
			requestId, providerId: "alpha", instanceId: "one",
			version: WORKFLOW_PROVIDER_VERSION, ready: true,
			capabilities: WORKFLOW_PROVIDER_CAPABILITIES,
		});
		controller.abort();
	});
	assert.deepEqual(await discoverWorkflowProviders(events, { signal: controller.signal, timeoutMs: 10 }), []);
});

test("a response for another run, role, session or provider incarnation cannot complete a request", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	let cancelled = 0;
	events.on("pi-workflows:provider:cancel", () => { cancelled++; });
	events.on("pi-workflows:provider:request", (data) => {
		const request = data as { requestId: string };
		for (const wrong of [
			{ ...owner, runId: "run-2" },
			{ ...owner, sessionId: "child" },
			{ ...owner, roleId: "reviewer" },
			{ ...owner, ownershipId: "lease-old" },
		]) events.emit(`pi-workflows:provider:reply:${request.requestId}`, {
			requestId: request.requestId, providerId: "alpha", instanceId: "one", owner: wrong, ok: true, data: { accepted: true },
		});
		events.emit(`pi-workflows:provider:reply:${request.requestId}`, {
			requestId: request.requestId, providerId: "alpha", instanceId: "old", owner, ok: true, data: { accepted: true },
		});
	});
	await assert.rejects(requestWorkflowProvider(events, provider, "launch", owner, launchPayload, { timeoutMs: 10 }), /timed out/);
	assert.equal(cancelled, 1);
});

test("cancelling a pending owned request notifies the provider and ignores its late answer", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	const controller = new AbortController();
	let cancelled: unknown;
	let sent: { requestId: string } | undefined;
	events.on("pi-workflows:provider:request", (value) => { sent = value as { requestId: string }; });
	events.on("pi-workflows:provider:cancel", (value) => { cancelled = value; });
	const pending = requestWorkflowProvider(events, provider, "stop", owner, {}, { signal: controller.signal });
	controller.abort();
	assert.deepEqual(cancelled, sent);
	events.emit(`pi-workflows:provider:reply:${sent?.requestId}`, {
		...sent, ok: true, data: { stopped: true },
	});
	await assert.rejects(pending, /cancelled/);
});

test("async result and ping delivery accepts only the current correlated owned role", () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	const received: unknown[] = [];
	const stop = subscribeWorkflowDelivery(events, provider, owner, "launch-1", (delivery) => received.push(delivery), { sessionPath: "/tmp/current.jsonl" });
	const good = { requestId: "launch-1", providerId: "alpha", instanceId: "one", owner, kind: "ping", message: "Working" };
	for (const wrong of [
		{ ...good, requestId: "launch-old" },
		{ ...good, owner: { ...owner, ownershipId: "lease-old" } },
		{ ...good, owner: { ...owner, sessionId: "child" } },
		{ ...good, providerId: "other" },
		{ ...good, instanceId: "old" },
	]) events.emit("pi-workflows:provider:delivery", wrong);
	assert.deepEqual(received, []);
	events.emit("pi-workflows:provider:delivery", good);
	assert.deepEqual(received, [good]);
	stop();
	events.emit("pi-workflows:provider:delivery", { ...good, kind: "result" });
	assert.equal(received.length, 1);
});

test("resume refuses missing identity/context facts or unconfirmed metadata updates", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	events.on("pi-workflows:provider:request", (value) => {
		const request = value as { requestId: string };
		events.emit(`pi-workflows:provider:reply:${request.requestId}`, {
			...request, ok: true, data: {
				sessionPath: "/tmp/role.jsonl", agentId: "writer",
				model: { provider: "test", model: "echo" },
				context: { tokens: 100, source: "session" }, metadataConfirmed: false,
			},
		});
	});
	await assert.rejects(
		requestWorkflowProvider(events, provider, "resume", owner, savedPayload, { timeoutMs: 10 }),
		/incomplete|unconfirmed/,
	);
});

test("an owned stop must be positively acknowledged before navigation", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	events.on("pi-workflows:provider:request", (request) => {
		const { requestId } = request as { requestId: string };
		events.emit(`pi-workflows:provider:reply:${requestId}`, {
			...(request as object), ok: true, data: { stopped: false },
		});
	});
	await assert.rejects(requestWorkflowProvider(events, provider, "stop", owner, {}, { timeoutMs: 10 }), /unconfirmed/);
});

test("a launch cannot succeed without acknowledged sidecar and session identity", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	events.on("pi-workflows:provider:request", (request) => {
		const { requestId } = request as { requestId: string };
		events.emit(`pi-workflows:provider:reply:${requestId}`, {
			...(request as object), ok: true, data: { accepted: true, metadataConfirmed: false },
		});
	});
	await assert.rejects(requestWorkflowProvider(events, provider, "launch", owner, launchPayload, { timeoutMs: 10 }), /unconfirmed|incomplete/);
});

test("metadata updates require provider confirmation", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	events.on("pi-workflows:provider:request", (request) => {
		const { requestId } = request as { requestId: string };
		events.emit(`pi-workflows:provider:reply:${requestId}`, { ...(request as object), ok: true, data: { confirmed: false } });
	});
	await assert.rejects(requestWorkflowProvider(events, provider, "update-metadata", owner, savedPayload, { timeoutMs: 10 }), /unconfirmed/);
});

test("unavailable required agent profiles cannot pass preflight", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	events.on("pi-workflows:provider:request", (request) => {
		const { requestId } = request as { requestId: string };
		events.emit(`pi-workflows:provider:reply:${requestId}`, { ...(request as object), ok: true, data: { profiles: [] } });
	});
	await assert.rejects(requestWorkflowProvider(events, provider, "profiles", owner, { requiredAgents: ["writer"] }, { timeoutMs: 10 }), /unavailable/);
});

test("a provider no longer alive cannot pass an owned liveness probe", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	events.on("pi-workflows:provider:request", (request) => {
		const { requestId } = request as { requestId: string };
		events.emit(`pi-workflows:provider:reply:${requestId}`, { ...(request as object), ok: true, data: { alive: false } });
	});
	await assert.rejects(requestWorkflowProvider(events, provider, "ping", owner, {}, { timeoutMs: 10 }), /unavailable/);
});

test("a valid launch returns its correlation ID for subsequent async delivery", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	let sentId = "";
	events.on("pi-workflows:provider:request", (request) => {
		const { requestId } = request as { requestId: string };
		sentId = requestId;
		events.emit(`pi-workflows:provider:reply:${requestId}`, { ...(request as object), ok: true, data: {
			accepted: true, sessionPath: "/tmp/role.jsonl",
			profile: { agentId: "writer", path: "/profiles/writer.md", hash: "abc" },
			model: { provider: "test", model: "echo" },
			context: { tokens: 100, source: "session" }, metadataConfirmed: true,
		} });
	});
	const response = await requestWorkflowProvider(events, provider, "launch", owner, launchPayload);
	assert.equal(response.requestId, sentId);
	assert.equal(response.data.sessionPath, "/tmp/role.jsonl");
});

test("a correlated launch reply must match the requested agent and explicit model without expected facts", async (t) => {
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	const model = { provider: "test", model: "echo", thinking: "high" };
	const facts = {
		accepted: true, sessionPath: "/tmp/role.jsonl",
		profile: { agentId: "writer", path: "/profiles/writer.md", hash: "abc" },
		model, context: { tokens: 0, source: "new-session" }, metadataConfirmed: true,
	};
	for (const [name, data] of [
		["agent", { ...facts, profile: { ...facts.profile, agentId: "reviewer" } }],
		["provider", { ...facts, model: { ...model, provider: "different" } }],
		["model", { ...facts, model: { ...model, model: "different" } }],
		["thinking", { ...facts, model: { ...model, thinking: "low" } }],
		["missing thinking", { ...facts, model: { provider: model.provider, model: model.model } }],
		["unapproved user selection", { ...facts, model: { ...model, model: "different" }, userSelectedModel: true }],
	] as const) await t.test(name, async () => {
		const events = fakeEvents();
		events.on("pi-workflows:provider:request", (request) => {
			const { requestId } = request as { requestId: string };
			events.emit(`pi-workflows:provider:reply:${requestId}`, { ...(request as object), ok: true, data });
		});
		await assert.rejects(
			requestWorkflowProvider(events, provider, "launch", owner, { ...launchPayload, model }, { timeoutMs: 100 }),
			(error: unknown) => {
				assert.ok(error instanceof WorkflowProviderCleanupRequiredError);
				assert.match(error.message, /incomplete|unconfirmed/);
				return true;
			},
		);
	});
});

test("launch accepts an explicit model match and treats omitted thinking as off", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	let returnedThinking: string | undefined;
	events.on("pi-workflows:provider:request", (request) => {
		const { requestId } = request as { requestId: string };
		events.emit(`pi-workflows:provider:reply:${requestId}`, { ...(request as object), ok: true, data: {
			accepted: true, sessionPath: "/tmp/role.jsonl",
			profile: { agentId: "writer", path: "/profiles/writer.md", hash: "abc" },
			model: { provider: "test", model: "echo", ...(returnedThinking ? { thinking: returnedThinking } : {}) },
			context: { tokens: 0, source: "new-session" }, metadataConfirmed: true,
		} });
	});
	for (const [requested, returned] of [["high", "high"], ["off", undefined], [undefined, "off"]]) {
		returnedThinking = returned;
		const response = await requestWorkflowProvider(events, provider, "launch", owner, {
			...launchPayload, model: { provider: "test", model: "echo", ...(requested ? { thinking: requested } : {}) },
		});
		assert.equal(response.data.model.thinking, returned);
	}
});

test("saved requests accept a different user-selected model only with permission and confirmation", async (t) => {
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	for (const operation of ["resume", "recover"] as const) {
		for (const allowed of [undefined, false, true]) for (const confirmed of [undefined, false, true]) {
			await t.test(`${operation}: permission=${allowed}, confirmation=${confirmed}`, async () => {
				const events = fakeEvents();
				const data = {
					sessionPath: "/tmp/role.jsonl",
					profile: { agentId: "writer", path: "/profiles/writer.md", hash: "abc" },
					model: { provider: "selected", model: "different", thinking: "high" },
					context: { tokens: 100, source: "session" }, metadataConfirmed: true,
					...(confirmed === undefined ? {} : { userSelectedModel: confirmed }),
				};
				events.on("pi-workflows:provider:request", (request) => {
					const { requestId } = request as { requestId: string };
					events.emit(`pi-workflows:provider:reply:${requestId}`, { ...(request as object), ok: true, data });
				});
				const response = requestWorkflowProvider(events, provider, operation, owner, {
					...savedPayload, failure: "credits exhausted",
					sessionPath: data.sessionPath,
					expected: { agentId: "writer", profileHash: "abc", model: { provider: "test", model: "previous" } },
					model: { provider: "test", model: "echo" },
					...(allowed === undefined ? {} : { allowUserModelSelection: allowed }),
				});
				if (allowed && confirmed) assert.deepEqual((await response).data, data);
				else await assert.rejects(response, WorkflowProviderCleanupRequiredError);
			});
		}
	}
});

test("a bounded launch request can wait past tmux shell readiness", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION,
		ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	events.on("pi-workflows:provider:request", (request) => {
		setTimeout(() => events.emit(`pi-workflows:provider:reply:${(request as { requestId: string }).requestId}`, {
			...(request as object), ok: true, data: {
				accepted: true, sessionPath: "/tmp/role.jsonl",
				profile: { agentId: "writer", path: "/profiles/writer.md", hash: "abc" },
				model: { provider: "test", model: "echo" },
				context: { tokens: 0, source: "new-session" }, metadataConfirmed: true,
			},
		}), 5_100);
	});
	const response = await requestWorkflowProvider(events, provider, "launch", owner,
		launchPayload, { timeoutMs: 6_000 });
	assert.equal(response.data.sessionPath, "/tmp/role.jsonl");
});

test("default launch timeout accommodates asynchronous pane setup", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION,
		ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	events.on("pi-workflows:provider:request", (request) => {
		setTimeout(() => events.emit(`pi-workflows:provider:reply:${(request as { requestId: string }).requestId}`, {
			...(request as object), ok: true, data: {
				accepted: true, sessionPath: "/tmp/role.jsonl",
				profile: { agentId: "writer", path: "/profiles/writer.md", hash: "abc" },
				model: { provider: "test", model: "echo" },
				context: { tokens: 0, source: "new-session" }, metadataConfirmed: true,
			},
		}), 350);
	});
	const response = await requestWorkflowProvider(events, provider, "launch", owner, launchPayload);
	assert.equal(response.data.sessionPath, "/tmp/role.jsonl");
});

test("async completion for an unexpected session or duplicate completion cannot advance a role", () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	const received: unknown[] = [];
	subscribeWorkflowDelivery(events, provider, owner, "launch-1", (delivery) => received.push(delivery), { sessionPath: "/tmp/current.jsonl" });
	const result = {
		requestId: "launch-1", providerId: "alpha", instanceId: "one", owner, kind: "result",
		result: { status: "completed", sessionPath: "/tmp/current.jsonl", message: "done" },
	};
	events.emit("pi-workflows:provider:delivery", { ...result, result: { ...result.result, sessionPath: "/tmp/old.jsonl" } });
	events.emit("pi-workflows:provider:delivery", result);
	events.emit("pi-workflows:provider:delivery", result);
	assert.deepEqual(received, [result]);
});

test("resume requires an expected saved session and profile identity", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	// @ts-expect-error Deliberately malformed JavaScript caller must still fail at runtime.
	await assert.rejects(requestWorkflowProvider(events, provider, "resume", owner, {}, { timeoutMs: 10 }), /expected session|identity/);
});

test("a compatible fake provider confirms owned recovery facts, liveness and stop", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run-1", roleId: "writer", ownershipId: "lease-1" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	const sessionPath = "/tmp/role.jsonl";
	events.on("pi-workflows:provider:request", (value) => {
		const request = value as { requestId: string; operation: string };
		const data = request.operation === "recover"
			? { sessionPath, profile: { agentId: "writer", path: "/profiles/writer.md", hash: "abc" },
				model: { provider: "test", model: "echo" }, context: { tokens: 100, source: "session" }, metadataConfirmed: true }
			: request.operation === "ping" ? { alive: true } : { stopped: true };
		events.emit(`pi-workflows:provider:reply:${request.requestId}`, { ...request, ok: true, data });
	});
	const recovered = await requestWorkflowProvider(events, provider, "recover", owner,
		{ ...savedPayload, sessionPath, expected: { agentId: "writer", profileHash: "abc" },
			model: launchPayload.model, failure: "credits exhausted" });
	assert.equal(recovered.data.sessionPath, sessionPath);
	assert.deepEqual((await requestWorkflowProvider(events, provider, "ping", owner, {})).data, { alive: true });
	assert.deepEqual((await requestWorkflowProvider(events, provider, "stop", owner, { sessionPath })).data, { stopped: true });
});

test("saved model/context mismatch or an unapproved rollover cannot pass validated facts", async () => {
	const events = fakeEvents();
	const owner = { sessionId: "parent", runId: "run", roleId: "writer", ownershipId: "lease" };
	const provider = { providerId: "alpha", instanceId: "one", version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES } as const;
	let returnedPath = "/saved.jsonl";
	events.on("pi-workflows:provider:request", (value) => {
		const request = value as { requestId: string };
		events.emit(`pi-workflows:provider:reply:${request.requestId}`, { ...request, ok: true, data: {
			sessionPath: returnedPath, profile: { agentId: "writer", path: "/profiles/writer.md", hash: "hash" },
			model: { provider: "test", model: "echo" }, context: { tokens: 100, source: "conservative" },
			metadataConfirmed: true,
		} });
	});
	const payload = { ...savedPayload, sessionPath: "/saved.jsonl", expected: {
		agentId: "writer", profileHash: "hash", model: { provider: "test", model: "different" }, contextTokens: 100,
	} };
	await assert.rejects(requestWorkflowProvider(events, provider, "resume", owner, payload), /incomplete|unconfirmed/);
	await assert.rejects(requestWorkflowProvider(events, provider, "resume", owner, {
		...payload, expected: { ...payload.expected, model: { provider: "test", model: "echo" }, contextTokens: 101 },
	}), /incomplete|unconfirmed/);
	returnedPath = "/replacement.jsonl";
	await assert.rejects(requestWorkflowProvider(events, provider, "resume", owner, {
		...payload, expected: { ...payload.expected, model: { provider: "test", model: "echo" } },
	}), /incomplete|unconfirmed/);
});
