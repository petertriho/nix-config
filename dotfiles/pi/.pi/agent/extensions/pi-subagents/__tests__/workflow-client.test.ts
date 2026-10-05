import assert from "node:assert/strict";
import test from "node:test";
import {
	WORKFLOW_PROVIDER_CAPABILITIES, WORKFLOW_PROVIDER_DELIVERY_CHANNEL,
	WORKFLOW_PROVIDER_REQUEST_CHANNEL, WORKFLOW_PROVIDER_VERSION,
	type WorkflowEventBus, type WorkflowOwner, type WorkflowProvider, type WorkflowRoleFacts,
	type WorkflowProviderRequestFor, type WorkflowProviderOutcomes,
} from "../adapters/workflow-contract.ts";
import { createWorkflowEventClient } from "../adapters/workflow-client.ts";

function bus() {
	const listeners = new Map<string, Set<(value: unknown) => void>>();
	const events: WorkflowEventBus = {
		on(channel, handler) {
			const set = listeners.get(channel) ?? new Set();
			set.add(handler);
			listeners.set(channel, set);
			return () => set.delete(handler);
		},
		emit(channel, value) {
			for (const handler of [...(listeners.get(channel) ?? [])]) handler(value);
		},
	};
	return { events, count: () => [...listeners.values()].reduce((n, set) => n + set.size, 0) };
}

const provider: WorkflowProvider = {
	providerId: "pi-agent-teams", instanceId: "incarnation-1",
	version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES,
};
const owner: WorkflowOwner = { sessionId: "parent", runId: "run", roleId: "writer", ownershipId: "lease" };
const workflow = {
	version: 1, workflowId: "test", runId: "run", roleId: "writer",
	manifestHash: "a".repeat(64), skillHash: "b".repeat(64),
	policy: "per-role", assignmentSource: "parent", projectRoot: "/repo", data: {},
};
const facts = {
	sessionPath: "/session.jsonl", profile: { agentId: "writer", path: "/agents/writer.md", hash: "hash" },
	model: { provider: "test", model: "echo" }, context: { tokens: 10, source: "saved" },
	metadataConfirmed: true as const,
};
const launch = {
	agentId: "writer", name: "Writer", task: "Write", model: facts.model,
	workflow, repositoryRoot: "/repo",
};
const saved = {
	sessionPath: facts.sessionPath, expected: { agentId: "writer", profileHash: "hash", model: facts.model },
	workflow, repositoryRoot: "/repo",
};

function fakeProvider(events: WorkflowEventBus) {
	const requests: WorkflowProviderRequestFor[] = [];
	const off = events.on(WORKFLOW_PROVIDER_REQUEST_CHANNEL, (value) => {
		// This peer receives requests constructed by the typed client, not arbitrary ingress.
		const request = value as WorkflowProviderRequestFor;
		requests.push(request);
		const outcome: WorkflowProviderOutcomes = {
			ping: { alive: true }, profiles: { profiles: [facts.profile] },
			inspect: facts, launch: { ...facts, accepted: true }, resume: facts, recover: facts,
			stop: { stopped: true }, "update-metadata": { confirmed: true },
		};
		events.emit(`pi-workflows:provider:reply:${request.requestId}`, {
			...request, ok: true, data: outcome[request.operation],
		});
	});
	return { requests, off };
}

test("preflight validates required profiles and liveness before a launch", async () => {
	const { events } = bus();
	const fake = fakeProvider(events);
	const client = createWorkflowEventClient(events, provider, { requestTimeoutMs: 20, livenessIntervalMs: 100 });
	assert.deepEqual(await client.preflight(owner, ["writer"]), [facts.profile]);
	const lease = await client.launch(owner, launch);
	assert.deepEqual(fake.requests.map((request) => request.operation), ["ping", "profiles", "launch"]);
	assert.equal(lease.facts.sessionPath, facts.sessionPath);
	const completion = assert.rejects(lease.result, /disposed/);
	lease.dispose();
	await completion;
	client.dispose();
	fake.off();
});

test("immediate correlated terminal delivery is captured before launch acknowledgement returns", async () => {
	const { events, count } = bus();
	const off = events.on(WORKFLOW_PROVIDER_REQUEST_CHANNEL, (value) => {
		const request = value as Record<string, unknown>;
		const deliver = (extra: object) => events.emit(WORKFLOW_PROVIDER_DELIVERY_CHANNEL, {
			...request, kind: "result", result: {
				sessionPath: facts.sessionPath, status: "completed", message: "immediate", successfulResponse: true,
			}, ...extra,
		});
		deliver({ owner: { ...owner, ownershipId: "stale" } });
		deliver({ instanceId: "stale" });
		deliver({ result: { sessionPath: "/other.jsonl", status: "completed", message: "wrong session" } });
		events.emit(`pi-workflows:provider:reply:${request.requestId}`, {
			...request, ok: true, data: { ...facts, accepted: true },
		});
		deliver({});
		deliver({ result: { sessionPath: facts.sessionPath, status: "failed", message: "duplicate" } });
	});
	const client = createWorkflowEventClient(events, provider, { requestTimeoutMs: 20 });
	try {
		const lease = await client.launch(owner, launch);
		void lease.result.catch(() => {});
		assert.equal(lease.active, false, "immediate terminal delivery must release confirmed ownership");
		assert.deepEqual(await lease.result, {
			sessionPath: facts.sessionPath, status: "completed", message: "immediate", successfulResponse: true,
		});
		assert.equal(count(), 1, "only the provider remains subscribed");
	} finally { client.dispose(); off(); }
	assert.equal(count(), 0);
});

test("early pings receive validated frozen lease facts and retain owned-stop", async () => {
	const { events, count } = bus();
	const requests: Array<Record<string, unknown>> = [];
	const off = events.on(WORKFLOW_PROVIDER_REQUEST_CHANNEL, (value) => {
		const request = value as Record<string, unknown>;
		requests.push(request);
		if (request.operation === "launch") {
			events.emit(WORKFLOW_PROVIDER_DELIVERY_CHANNEL, {
				...request, kind: "ping", message: "Need input",
			});
		}
		events.emit(`pi-workflows:provider:reply:${request.requestId}`, {
			...request, ok: true,
			data: request.operation === "stop" ? { stopped: true } : { ...facts, accepted: true },
		});
	});
	const client = createWorkflowEventClient(events, provider, { requestTimeoutMs: 20 });
	const pings: Array<{ message: string; facts?: WorkflowRoleFacts }> = [];
	try {
		const lease = await client.launch(owner, launch, {
			onPing: (ping, confirmed?: WorkflowRoleFacts) => pings.push({ message: ping.message, facts: confirmed }),
		});
		void lease.result.catch(() => {});
		assert.equal(pings.length, 1);
		assert.equal(pings[0].message, "Need input");
		assert.equal(pings[0].facts, lease.facts);
		assert.deepEqual(pings[0].facts, facts);
		assert.equal(Object.isFrozen(pings[0].facts), true);
		assert.equal(Object.isFrozen(pings[0].facts?.model), true);
		assert.equal(lease.active, true);
		const stopped = assert.rejects(lease.result, /stopped by owner/);
		await lease.stop();
		await stopped;
		assert.equal(lease.active, false);
		assert.deepEqual(requests.map((request) => request.operation), ["launch", "stop"]);
		assert.deepEqual(requests[1].payload, { sessionPath: facts.sessionPath });
	} finally { client.dispose(); off(); }
	assert.equal(count(), 0);
});

for (const operation of ["launch", "resume", "recover"] as const) {
	test(`${operation} retains an early terminal result after 32 buffered pings`, async () => {
		const { events, count } = bus();
		const off = events.on(WORKFLOW_PROVIDER_REQUEST_CHANNEL, (value) => {
			const request = value as Record<string, unknown>;
			for (let index = 0; index < 32; index++) {
				events.emit(WORKFLOW_PROVIDER_DELIVERY_CHANNEL, {
					...request, kind: "ping", message: `Working ${index}`,
				});
			}
			events.emit(WORKFLOW_PROVIDER_DELIVERY_CHANNEL, {
				...request, kind: "result", result: {
					sessionPath: facts.sessionPath, status: "completed", message: "done", successfulResponse: true,
				},
			});
			events.emit(`pi-workflows:provider:reply:${request.requestId}`, {
				...request, ok: true,
				data: operation === "launch" ? { ...facts, accepted: true } : facts,
			});
		});
		const client = createWorkflowEventClient(events, provider, { requestTimeoutMs: 20 });
		const pings: string[] = [];
		const options = { onPing: (ping: { message: string }) => pings.push(ping.message) };
		try {
			const lease = operation === "launch"
				? await client.launch(owner, launch, options)
				: operation === "resume"
					? await client.resume(owner, saved, options)
					: await client.recover(owner, { ...saved, failure: "credits exhausted", model: facts.model }, options);
			void lease.result.catch(() => {});
			assert.equal(lease.active, false, "the buffered terminal result must settle before returning the lease");
			assert.deepEqual(await lease.result, {
				sessionPath: facts.sessionPath, status: "completed", message: "done", successfulResponse: true,
			});
			assert.equal(pings.length, 31, "one ping yields its slot to the result without exceeding the 32-delivery bound");
			assert.equal(count(), 1, "only the provider remains subscribed");
		} finally { client.dispose(); off(); }
		assert.equal(count(), 0);
	});
}

test("correlated results are frozen; stale and duplicate results never complete a lease", async () => {
	const { events } = bus();
	const fake = fakeProvider(events);
	const client = createWorkflowEventClient(events, provider, { requestTimeoutMs: 20, livenessIntervalMs: 100 });
	const pings: Array<{ message: string }> = [];
	const lease = await client.launch(owner, launch, { onPing: (ping) => pings.push(ping) });
	const request = fake.requests[0];
	const emit = (data: object) => events.emit(WORKFLOW_PROVIDER_DELIVERY_CHANNEL, {
		...request, kind: "result", result: {
			sessionPath: facts.sessionPath, status: "completed", message: "done",
		}, ...data,
	});
	emit({ owner: { ...owner, ownershipId: "old" } });
	emit({ requestId: "old" });
	emit({ instanceId: "old" });
	emit({ result: { sessionPath: "/other.jsonl", status: "completed", message: "old" } });
	emit({ result: { sessionPath: facts.sessionPath, status: "completed", message: "invalid", successfulResponse: "yes" } });
	assert.equal(lease.active, true, "malformed response evidence cannot settle a lease");
	events.emit(WORKFLOW_PROVIDER_DELIVERY_CHANNEL, { ...request, kind: "ping", message: "Working" });
	assert.deepEqual(pings.map((ping) => ping.message), ["Working"]);
	const evidence = { sessionPath: facts.sessionPath, status: "completed", message: "done", successfulResponse: true };
	emit({ result: evidence });
	const result = await lease.result;
	evidence.successfulResponse = false;
	assert.equal(result.successfulResponse, true);
	assert.equal(Object.isFrozen(result), true);
	emit({ result: { sessionPath: facts.sessionPath, status: "failed", message: "late" } });
	assert.equal((await lease.result).status, "completed");
	client.dispose();
	fake.off();
});

test("missing profile or unconfirmed role and metadata facts never create a lease", async () => {
	const { events, count } = bus();
	const client = createWorkflowEventClient(events, provider, { requestTimeoutMs: 10 });
	const off = events.on(WORKFLOW_PROVIDER_REQUEST_CHANNEL, (value) => {
		const request = value as Record<string, unknown>;
		const outcomes: Record<string, unknown> = {
			ping: { alive: true }, profiles: { profiles: [] },
			launch: { ...facts, accepted: true, metadataConfirmed: false },
			resume: { ...facts, profile: { ...facts.profile, hash: "wrong" } },
			"update-metadata": { confirmed: false },
		};
		events.emit(`pi-workflows:provider:reply:${request.requestId}`, {
			...request, ok: true, data: outcomes[String(request.operation)],
		});
	});
	await assert.rejects(client.preflight(owner, ["writer"]), /unavailable/);
	await assert.rejects(client.launch(owner, launch), /unconfirmed/);
	await assert.rejects(client.resume(owner, saved), /unconfirmed/);
	await assert.rejects(client.updateMetadata(owner, saved), /unconfirmed/);
	client.dispose();
	off();
	assert.equal(count(), 0);
});

test("a terminal result with unconfirmed pane closure retains a strictly stoppable lease", async () => {
	const { events } = bus();
	const fake = fakeProvider(events);
	const client = createWorkflowEventClient(events, provider, { requestTimeoutMs: 20 });
	try {
		const lease = await client.launch(owner, launch);
		events.emit(WORKFLOW_PROVIDER_DELIVERY_CHANNEL, {
			...fake.requests[0], kind: "result",
			result: { sessionPath: facts.sessionPath, status: "failed", message: "close failed", stopRequired: true },
		});
		assert.equal((await lease.result).status, "failed");
		assert.equal(lease.active, true);
		await lease.stop();
		assert.equal(lease.active, false);
	} finally {
		client.dispose();
		fake.off();
	}
});

test("stop waits for owned confirmation, rejects failed acknowledgement, and permits retry", async () => {
	const { events } = bus();
	const fake = fakeProvider(events);
	const client = createWorkflowEventClient(events, provider, { requestTimeoutMs: 20, livenessIntervalMs: 100 });
	const lease = await client.launch(owner, launch);
	const completion = assert.rejects(lease.result, /stopped/);
	fake.off();
	let reply: ((data: unknown) => void) | undefined;
	const off = events.on(WORKFLOW_PROVIDER_REQUEST_CHANNEL, (value) => {
		const request = value as Record<string, unknown>;
		reply = (data) => events.emit(`pi-workflows:provider:reply:${request.requestId}`, { ...request, ok: true, data });
	});
	const first = lease.stop();
	assert.equal(reply !== undefined, true);
	reply?.({ stopped: false });
	await assert.rejects(first, /unconfirmed/);
	assert.equal(lease.active, true);
	const second = lease.stop();
	let settled = false;
	void second.then(() => { settled = true; });
	await Promise.resolve();
	assert.equal(settled, false);
	reply?.({ stopped: true });
	await second;
	await completion;
	assert.equal(lease.active, false);
	off();
	client.dispose();
});

test("an unacknowledged stop times out without closing ownership; shutdown invalidates it", async () => {
	const { events, count } = bus();
	const fake = fakeProvider(events);
	const client = createWorkflowEventClient(events, provider, { requestTimeoutMs: 10, livenessIntervalMs: 1_000 });
	const lease = await client.launch(owner, launch);
	const completion = assert.rejects(lease.result, /disposed/);
	fake.off();
	await assert.rejects(lease.stop(), /timed out/);
	assert.equal(lease.active, true);
	client.dispose();
	await completion;
	assert.equal(lease.active, false);
	assert.equal(count(), 0);
});

test("resume and recovery require validated identity, metadata acknowledgement and liveness", async () => {
	const { events } = bus();
	const fake = fakeProvider(events);
	const client = createWorkflowEventClient(events, provider, { requestTimeoutMs: 20, livenessIntervalMs: 100 });
	await assert.rejects(client.resume(owner, { ...saved, expected: { agentId: "", profileHash: "" } }), /identity/);
	const resumed = await client.resume(owner, saved);
	assert.equal(resumed.facts.context.tokens, 10);
	const resumedCompletion = assert.rejects(resumed.result, /disposed/);
	resumed.dispose();
	await resumedCompletion;
	const recovered = await client.recover(owner, { ...saved, failure: "credits exhausted", model: facts.model });
	assert.equal(recovered.facts.metadataConfirmed, true);
	const recoveredCompletion = assert.rejects(recovered.result, /disposed/);
	recovered.dispose();
	await recoveredCompletion;
	assert.deepEqual(await client.updateMetadata(owner, saved), { confirmed: true });
	assert.deepEqual(fake.requests.map((request) => request.operation),
		["resume", "recover", "update-metadata"]);
	assert.deepEqual(await client.ping(owner), { alive: true });
	client.dispose();
	fake.off();
});

test("provider loss fails the pending lease closed; late delivery and replacement cannot revive it", async () => {
	const { events, count } = bus();
	const fake = fakeProvider(events);
	const client = createWorkflowEventClient(events, provider, { requestTimeoutMs: 12, livenessIntervalMs: 10 });
	const lease = await client.launch(owner, launch);
	const original = fake.requests[0];
	fake.off();
	await assert.rejects(lease.result, /provider|timed out/i);
	assert.equal(lease.active, false);
	events.emit(WORKFLOW_PROVIDER_DELIVERY_CHANNEL, {
		...original, kind: "result", result: {
			...facts, status: "completed", message: "late",
		},
	});
	await assert.rejects(lease.result, /provider|timed out/i);
	client.dispose();
	assert.equal(count(), 0);
});
