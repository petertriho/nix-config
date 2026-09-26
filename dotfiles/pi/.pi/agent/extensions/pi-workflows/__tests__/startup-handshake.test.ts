import assert from "node:assert/strict";
import test from "node:test";
import {
	WORKFLOW_PROVIDER_CAPABILITIES,
	WORKFLOW_PROVIDER_DISCOVER_CHANNEL,
	WORKFLOW_PROVIDER_VERSION,
	type WorkflowEventBus,
	type WorkflowProvider,
} from "../../workflow-provider/contract.ts";
import { createWorkflowStartupHandshake } from "../startup-handshake.ts";

function eventBus(): WorkflowEventBus {
	const handlers = new Map<string, Set<(data: unknown) => void>>();
	return {
		on(channel, handler) {
			const group = handlers.get(channel) ?? new Set();
			group.add(handler);
			handlers.set(channel, group);
			return () => group.delete(handler);
		},
		emit(channel, data) {
			for (const handler of [...(handlers.get(channel) ?? [])]) handler(data);
		},
	};
}

function provider(id = "pi-tmux-subagents"): WorkflowProvider {
	return {
		providerId: id,
		instanceId: `instance-${id}`,
		version: WORKFLOW_PROVIDER_VERSION,
		ready: true,
		capabilities: WORKFLOW_PROVIDER_CAPABILITIES,
	};
}

function answerDiscovery(bus: WorkflowEventBus, identity: unknown): () => void {
	return bus.on(WORKFLOW_PROVIDER_DISCOVER_CHANNEL, (value) => {
		if (typeof value !== "object" || value === null || !("requestId" in value)) return;
		bus.emit(`${WORKFLOW_PROVIDER_DISCOVER_CHANNEL}:reply:${value.requestId}`, {
			requestId: value.requestId,
			...identity as object,
		});
	});
}

test("startup handshake registers once with tmux loaded before or after session_start", async () => {
	for (const order of ["provider-first", "coordinator-first"]) {
		const bus = eventBus();
		let detach = () => {};
		if (order === "provider-first") detach = answerDiscovery(bus, provider());
		const registered: WorkflowProvider[][] = [];
		const notifications: string[] = [];
		const handshake = createWorkflowStartupHandshake(bus, {
			timeoutMs: 85,
			register: (available) => { registered.push([...available]); },
			notify: (message) => notifications.push(message),
		});
		const pending = handshake.start();
		assert.equal(registered.length, 0, "registration waits for a completed handshake");
		if (order === "coordinator-first") {
			await new Promise((resolve) => setTimeout(resolve, 12));
			detach = answerDiscovery(bus, provider());
		}
		await Promise.all([pending, handshake.start()]);
		assert.deepEqual(registered.map((entry) => entry.map((item) => item.providerId)), [["pi-tmux-subagents"]]);
		assert.deepEqual(notifications, []);
		await handshake.start();
		assert.equal(registered.length, 1);
		handshake.shutdown();
		detach();
	}
});

test("startup handshake exposes nothing without a complete compatible provider", async () => {
	for (const identity of [null, { ...provider(), version: 2 }, {
		...provider(), capabilities: WORKFLOW_PROVIDER_CAPABILITIES.filter((cap) => cap !== "owned-stop"),
	}]) {
		const bus = eventBus();
		const detach = identity ? answerDiscovery(bus, identity) : () => {};
		const registered: unknown[] = [];
		const notifications: string[] = [];
		const handshake = createWorkflowStartupHandshake(bus, {
			timeoutMs: 20,
			register: (providers) => registered.push(providers),
			notify: (message) => notifications.push(message),
		});
		await handshake.start();
		assert.deepEqual(registered, []);
		assert.match(notifications[0] ?? "", /workflow.*provider/i);
		handshake.shutdown();
		detach();
	}
});

test("shutdown cancels an in-flight discovery, including late compatible replies", async () => {
	const bus = eventBus();
	const registered: unknown[] = [];
	const notifications: string[] = [];
	const handshake = createWorkflowStartupHandshake(bus, {
		timeoutMs: 60,
		register: (providers) => registered.push(providers),
		notify: (message) => notifications.push(message),
	});
	const pending = handshake.start();
	handshake.shutdown();
	const detach = answerDiscovery(bus, provider());
	await pending;
	assert.deepEqual(registered, []);
	assert.deepEqual(notifications, []);
	detach();
});

test("child sessions never probe or expose workflow capabilities", async () => {
	const bus = eventBus();
	let probes = 0;
	const detach = bus.on(WORKFLOW_PROVIDER_DISCOVER_CHANNEL, () => { probes++; });
	const registered: unknown[] = [];
	const handshake = createWorkflowStartupHandshake(bus, {
		env: { PI_SUBAGENT_ID: "child" },
		register: (providers) => registered.push(providers),
		notify: () => { throw new Error("Child must not notify"); },
	});
	await handshake.start();
	assert.equal(probes, 0);
	assert.deepEqual(registered, []);
	handshake.shutdown();
	detach();
});

test("startup handshake hands off every compatible provider without choosing by load order", async () => {
	const bus = eventBus();
	const first = answerDiscovery(bus, provider("second"));
	const second = answerDiscovery(bus, provider("first"));
	const registered: string[][] = [];
	const handshake = createWorkflowStartupHandshake(bus, {
		timeoutMs: 20,
		register: (providers) => registered.push(providers.map((item) => item.providerId)),
		notify: () => {},
	});
	await handshake.start();
	assert.deepEqual(registered, [["second", "first"]]);
	handshake.shutdown();
	first();
	second();
});
