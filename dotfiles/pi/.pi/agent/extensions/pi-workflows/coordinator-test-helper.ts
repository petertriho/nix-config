import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import type { WorkflowEventBus } from "../workflow-provider/contract.ts";
import {
	WORKFLOW_PROVIDER_CAPABILITIES, WORKFLOW_PROVIDER_DELIVERY_CHANNEL,
	WORKFLOW_PROVIDER_DISCOVER_CHANNEL, WORKFLOW_PROVIDER_REQUEST_CHANNEL, WORKFLOW_PROVIDER_VERSION,
} from "../workflow-provider/contract.ts";
import { loadWorkflowDefinitionFromPackage } from "./workflow/schema.ts";
import { createWorkflowRunState, getActiveWorkflowRun, startWorkflowRun } from "./workflow/state.ts";

export type AnyRecord = Record<string, any>;
export const MODEL = {
	provider: "anthropic", id: "claude", name: "Claude", api: "anthropic-messages",
	baseUrl: "https://api.anthropic.test", reasoning: true, input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 200_000, maxTokens: 16_000,
};

export async function until(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (!predicate()) {
		assert.ok(Date.now() < deadline, "condition did not settle within the bounded wait");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

export async function withParent(run: (root: string) => Promise<void>): Promise<void> {
	const root = mkdtempSync(join(tmpdir(), "pi-coordinator-"));
	const saved = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("PI_")));
	for (const key of Object.keys(saved)) delete process.env[key];
	process.env.PI_CODING_AGENT_DIR = join(root, "agent");
	process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS = "0";
	try { await run(root); }
	finally {
		for (const key of Object.keys(process.env)) if (key.startsWith("PI_")) delete process.env[key];
		Object.assign(process.env, saved);
		rmSync(root, { recursive: true, force: true });
	}
}

export function writeWorkflowFixture(root: string) {
	const dir = join(root, "agent", "workflows", "docs-review");
	mkdirSync(dir, { recursive: true });
	mkdirSync(join(root, "agent", "agents"), { recursive: true });
	writeFileSync(join(root, "agent", "agents", "scribe.md"), "---\nname: scribe\nauto-exit: true\n---\nWrite documentation.\n");
	writeFileSync(join(dir, "workflow.json"), JSON.stringify({
		version: 1, id: "docs-review",
		command: { name: "docs", description: "Run the documentation review workflow", argumentHint: "<request>" },
		skill: "SKILL.md", data: {},
		roles: [{ id: "author", label: "Author", agent: "scribe", reads: [], writes: [], handoff: "Continue authoring." }],
	}));
	writeFileSync(join(dir, "SKILL.md"), "---\nname: docs-private\ndescription: Private docs workflow.\n---\n\n# Docs\n");
	const loaded = loadWorkflowDefinitionFromPackage(dir);
	assert.equal(loaded.status, "ok");
	if (loaded.status !== "ok") throw new Error("invalid workflow fixture");
	return loaded.definition;
}

export function savedRun(root: string, runId = "run-docs") {
	return getActiveWorkflowRun(startWorkflowRun(createWorkflowRunState(), {
		runId, source: "global", definition: writeWorkflowFixture(root),
		projectRoot: root, policy: "per-role", assignmentSource: "preset",
		originalAssignments: { author: { provider: MODEL.provider, model: MODEL.id, thinking: "off" } },
	}).state)!;
}

/** Public extension API harness: state is supplied only through the session branch. */
export function coordinatorFixture(root: string, events = createEventBus()) {
	const handlers = new Map<string, Array<(event: any, ctx: any) => unknown>>();
	const commands: AnyRecord[] = [];
	const tools: AnyRecord[] = [];
	const notifications: Array<[string, string]> = [];
	const entries: AnyRecord[] = [];
	const messages: AnyRecord[] = [];
	const userMessages: string[] = [];
	let branch: AnyRecord[] = [];
	let sessionId = "parent";
	const pi = {
		events,
		on(name: string, handler: (event: any, ctx: any) => unknown) {
			const group = handlers.get(name) ?? [];
			group.push(handler);
			handlers.set(name, group);
		},
		registerTool(tool: AnyRecord) { tools.push(tool); },
		registerCommand(name: string, command: AnyRecord) { commands.push({ name, ...command }); },
		getCommands: () => commands.map((command) => ({ ...command, source: "extension" })),
		registerShortcut() {},
		registerMessageRenderer() {},
		getAllTools: () => [],
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data: structuredClone(data) });
		},
		sendMessage(message: AnyRecord, options?: AnyRecord) { messages.push({ message, options }); },
		sendUserMessage(message: string) { userMessages.push(message); },
	};
	const ctx: AnyRecord = {
		cwd: root, hasUI: true, isIdle: () => true, isProjectTrusted: () => true,
		model: MODEL, thinkingLevel: "off", scopedModels: [],
		modelRegistry: { getAvailable: () => [MODEL] },
		sessionManager: {
			getSessionFile: () => join(root, `${sessionId}.jsonl`),
			getSessionId: () => sessionId, getSessionDir: () => root,
			getBranch: () => branch,
		},
		ui: {
			notify(message: string, level: string) { notifications.push([message, level]); },
			setWidget() {}, setStatus() {},
			confirm: async () => true,
			select: async (_title: string, choices: string[]) => choices[0],
		},
	};
	async function emit(name: string, event: AnyRecord = {}) {
		for (const handler of handlers.get(name) ?? []) {
			const result = await handler(event, ctx);
			if ((result as AnyRecord)?.cancel) return result;
		}
	}
	const command = (name: string, args: string) => {
		const found = commands.find((item) => item.name === name);
		assert.ok(found, `missing command ${name}`);
		return found.handler(args, ctx);
	};
	const tool = (name: string, params: AnyRecord) => {
		const found = tools.find((item) => item.name === name);
		assert.ok(found, `missing tool ${name}`);
		return found.execute("call", params, undefined, undefined, ctx);
	};
	return {
		pi, events, ctx, commands, tools, notifications, entries, messages, userMessages, handlers, emit, command, tool,
		setBranch(value: AnyRecord[]) { branch = value; },
		setSession(id: string) { sessionId = id; },
		restore(snapshot: unknown) { branch = [{ type: "custom", customType: "pi-tmux-subagents.workflow-run", data: snapshot }]; },
		async status(): Promise<string> { await command("workflow", "status"); return notifications.at(-1)![0]; },
	};
}

/** A conforming execution peer; no coordinator or tmux implementation is stubbed. */
export function fakeProvider(events: WorkflowEventBus, instanceId = "one") {
	const identity = {
		providerId: "pi-tmux-subagents", instanceId,
		version: WORKFLOW_PROVIDER_VERSION, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES,
	};
	const requests: AnyRecord[] = [];
	let stopError: string | undefined;
	const detachDiscovery = events.on(WORKFLOW_PROVIDER_DISCOVER_CHANNEL, (request: any) => {
		events.emit(`${WORKFLOW_PROVIDER_DISCOVER_CHANNEL}:reply:${request.requestId}`, { ...identity, requestId: request.requestId });
	});
	const detachRequests = events.on(WORKFLOW_PROVIDER_REQUEST_CHANNEL, (request: any) => {
		if (request.providerId !== identity.providerId || request.instanceId !== instanceId) return;
		requests.push(request);
		const payload = request.payload;
		const data = request.operation === "ping" ? { alive: true }
			: request.operation === "profiles" ? { profiles: payload.requiredAgents.map((agentId: string) => ({ agentId, path: `/profiles/${agentId}.md`, hash: "hash" })) }
			: request.operation === "stop" ? { stopped: true }
			: {
				accepted: true, sessionPath: `/tmp/${request.owner.sessionId}-${request.owner.roleId}.jsonl`,
				profile: { agentId: payload.agentId, path: `/profiles/${payload.agentId}.md`, hash: "hash" },
				model: payload.model, context: { tokens: 0, source: "test" }, metadataConfirmed: true,
			};
		events.emit(`${WORKFLOW_PROVIDER_REQUEST_CHANNEL}:reply:${request.requestId}`, {
			...request, ...(request.operation === "stop" && stopError ? { ok: false, error: stopError } : { ok: true, data }),
		});
	});
	return {
		requests,
		setStopError(error?: string) { stopError = error; },
		deliver(request: AnyRecord, result: AnyRecord) {
			events.emit(WORKFLOW_PROVIDER_DELIVERY_CHANNEL, { ...request, kind: "result", result });
		},
		detach() { detachDiscovery(); detachRequests(); },
	};
}
