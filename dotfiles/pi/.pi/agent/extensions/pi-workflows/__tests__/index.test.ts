import assert from "node:assert/strict";
import test from "node:test";
import piWorkflows from "../index.ts";
import {
	WORKFLOW_PROVIDER_CAPABILITIES, WORKFLOW_PROVIDER_DISCOVER_CHANNEL, WORKFLOW_PROVIDER_VERSION,
	type WorkflowEventBus,
} from "../../workflow-provider/contract.ts";

function fixture() {
	const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
	const subscribers = new Map<string, Set<(value: unknown) => void>>();
	const events: WorkflowEventBus = {
		on(name, callback) {
			const group = subscribers.get(name) ?? new Set();
			group.add(callback);
			subscribers.set(name, group);
			return () => group.delete(callback);
		},
		emit(name, value) { for (const callback of [...(subscribers.get(name) ?? [])]) callback(value); },
	};
	const commands = new Map<string, any>();
	const tools = new Map<string, any>();
	const pi = {
		events,
		on(name: string, handler: (event: unknown, ctx: unknown) => unknown) {
			const group = handlers.get(name) ?? [];
			group.push(handler);
			handlers.set(name, group);
		},
		registerCommand(name: string, command: unknown) { commands.set(name, command); },
		getCommands() { return [...commands.entries()].map(([name, command]) => ({ name, source: "extension", ...command })); },
		registerTool(tool: { name: string }) { tools.set(tool.name, tool); },
		appendEntry() {},
		sendMessage() {},
		sendUserMessage() {},
	};
	const notifications: string[] = [];
	const ctx = {
		cwd: process.cwd(), isProjectTrusted: () => false, hasUI: false,
		sessionManager: {
			getSessionFile: () => "/tmp/pi-workflows-parent.jsonl",
			getSessionId: () => "parent", getBranch: () => [],
		},
		ui: { notify(message: string) { notifications.push(message); }, setStatus() {}, setWidget() {} },
	};
	async function start() {
		for (const handler of handlers.get("session_start") ?? []) await handler({}, ctx);
		for (const handler of handlers.get("before_agent_start") ?? []) await handler({}, ctx);
	}
	return { pi, events, commands, tools, notifications, start, handlers, ctx };
}

function provider(bus: WorkflowEventBus) {
	return bus.on(WORKFLOW_PROVIDER_DISCOVER_CHANNEL, (request: any) => {
		bus.emit(`${WORKFLOW_PROVIDER_DISCOVER_CHANNEL}:reply:${request.requestId}`, {
			requestId: request.requestId, providerId: "pi-tmux-subagents", instanceId: "one",
			version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES,
		});
	});
}

async function asParent(run: () => Promise<void>): Promise<void> {
	const keys = ["PI_SUBAGENT_ID", "PI_SUBAGENT_SESSION", "PI_SUBAGENT_NAME", "PI_SUBAGENT_AGENT", "PI_DENY_TOOLS"] as const;
	const saved = keys.map((key) => process.env[key]);
	for (const key of keys) delete process.env[key];
	try { await run(); }
	finally {
		keys.forEach((key, index) => {
			if (saved[index] === undefined) delete process.env[key];
			else process.env[key] = saved[index];
		});
	}
}

test("coordinator registers no workflow tools or commands without a compatible provider", async () => {
	await asParent(async () => {
	const f = fixture();
	piWorkflows(f.pi as never);
	await f.start();
	assert.equal(f.commands.size, 0);
	assert.equal(f.tools.size, 0);
	assert.match(f.notifications.join("\n"), /disabled.*provider/i);
	});
});

test("provider loaded before or after coordinator exposes exactly one owner and bundled Peter", async () => {
	await asParent(async () => {
	for (const order of ["provider-first", "coordinator-first"]) {
		const f = fixture();
		const detach = order === "provider-first" ? provider(f.events) : undefined;
		piWorkflows(f.pi as never);
		const start = f.start();
		if (order === "coordinator-first") provider(f.events);
		await start;
		assert.equal(f.commands.has("workflow"), true, JSON.stringify([...f.commands.keys()]));
		assert.equal(f.commands.has("peter"), true, JSON.stringify({ commands: [...f.commands.keys()], notifications: f.notifications }));
		assert.equal(f.tools.has("workflow_spawn"), true);
		assert.equal(f.tools.has("workflow_gate"), true);
		const list = await f.commands.get("workflow").handler("list", {
			cwd: process.cwd(), isProjectTrusted: () => false,
			ui: { notify() {} },
		});
		assert.ok(list !== false);
		detach?.();
	}
	});
});

test("coordinator honors child-session and denied-tool boundaries", async () => {
	await asParent(async () => {
		for (const [key, value] of [["PI_SUBAGENT_ID", "child"], ["PI_SUBAGENT_SESSION", "/tmp/child"], ["PI_DENY_TOOLS", "workflow_gate,workflow_spawn"]]) {
			process.env[key] = value;
			const f = fixture();
			const detach = provider(f.events);
			try {
				piWorkflows(f.pi as never);
				await f.start();
				assert.equal(f.tools.has("workflow_gate"), false);
				assert.equal(f.tools.has("workflow_spawn"), false);
				if (key !== "PI_DENY_TOOLS") assert.equal(f.commands.size, 0);
			} finally { delete process.env[key]; detach(); }
		}
	});
});
