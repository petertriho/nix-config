import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { isDeepStrictEqual } from "node:util";
import piWorkflows from "../index.ts";
import { coordinatorFixture, MODEL, savedRun, until, withParent } from "../coordinator-test-helper.ts";
import { attachTmuxWorkflowProvider } from "../../pi-tmux-subagents/workflow-provider.ts";
import { hashText, type LaunchProfile } from "../../pi-tmux-subagents/launch-profile.ts";
import type { RunningSubagent } from "../../pi-tmux-subagents/subagent-services.ts";
import {
	WORKFLOW_PROVIDER_CAPABILITIES, WORKFLOW_PROVIDER_DISCOVER_CHANNEL as DISCOVER,
	WORKFLOW_PROVIDER_REQUEST_CHANNEL as REQUEST, WORKFLOW_PROVIDER_DELIVERY_CHANNEL as DELIVERY,
	type WorkflowProviderRequest,
} from "../../workflow-provider/contract.ts";

async function fixture(run: (f: ReturnType<typeof setup>) => Promise<void>, ids = ["pi-tmux-subagents"]) {
	const root = mkdtempSync(join(tmpdir(), "workflow-coordinator-"));
	const keys = ["PI_SUBAGENT_ID", "PI_SUBAGENT_SESSION", "PI_SUBAGENT_AGENT", "PI_SUBAGENT_NAME", "PI_DENY_TOOLS", "PI_CODING_AGENT_DIR"];
	const old = keys.map((key) => process.env[key]);
	for (const key of keys) delete process.env[key];
	process.env.PI_CODING_AGENT_DIR = join(root, "agent");
	execFileSync("git", ["init", "-q", root]);
	const dir = join(root, ".pi/workflows/docs-review");
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, "workflow.json"), JSON.stringify({
		version: 1, id: "docs-review", command: { name: "docs", description: "Review documents" }, skill: "SKILL.md",
		data: {}, roles: [{ id: "author", label: "Author", agent: "writer", reads: [], writes: [], handoff: "Continue writing." }],
	}));
	writeFileSync(join(dir, "SKILL.md"), "---\nname: docs-review\ndescription: Review documents\n---\nUse workflow tools.");
	const f = setup(root, ids);
	try { await run(f); }
	finally {
		await f.fire("session_shutdown").catch(() => {});
		keys.forEach((key, i) => { if (old[i] === undefined) delete process.env[key]; else process.env[key] = old[i]; });
		rmSync(root, { recursive: true, force: true });
	}
}

function setup(root: string, ids: string[]) {
	const handlers = new Map<string, Array<(...args: any[]) => any>>();
	const subscribers = new Map<string, Set<(data: any) => void>>();
	const events = {
		on(name: string, cb: (value: any) => void) {
			const group = subscribers.get(name) ?? new Set(); group.add(cb); subscribers.set(name, group);
			return () => group.delete(cb);
		},
		emit(name: string, data: any) { for (const cb of [...(subscribers.get(name) ?? [])]) cb(data); },
	};
	const commands = new Map<string, any>(), tools = new Map<string, any>();
	const messages: any[] = [], notifications: string[] = [], prompts: string[] = [], requests: any[] = [];
	const persisted: any[] = [];
	const deferredReplies = new Map<string, (reply: { request: any; acknowledge: () => void }) => void>();
	let branch: any[] = [], appendFailures = new Set<number>(), appendCount = 0;
	let instance = 1, stopFails = false, messagesFail = false, currentSession = "parent-one";
	let choice: string | null = ids[0] ?? null;
	const model: any = { provider: "test", id: "echo", name: "Echo", reasoning: false,
		api: "openai-responses", baseUrl: "https://unused.test", input: ["text"], contextWindow: 200000,
		maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
	const ctx: any = {
		cwd: root, hasUI: true, isIdle: () => true, isProjectTrusted: () => true, model, thinkingLevel: "off",
		modelRegistry: { getAvailable: () => [model] }, scopedModels: [],
		sessionManager: { getSessionFile: () => join(root, `${currentSession}.jsonl`),
			getSessionId: () => currentSession, getSessionDir: () => root, getBranch: () => branch },
		ui: {
			notify(message: string) { notifications.push(message); }, setStatus() {}, setWidget() {},
			confirm: async () => true,
			select: async (title: string, options: string[]) => {
				prompts.push(title);
				return title === "Workflow execution provider" ? choice ?? undefined : options[0];
			},
		},
	};
	const pi: any = {
		events,
		on(name: string, cb: (...args: any[]) => any) { const group = handlers.get(name) ?? []; group.push(cb); handlers.set(name, group); },
		registerCommand(name: string, command: any) { assert.ok(!commands.has(name), `duplicate /${name}`); commands.set(name, command); },
		registerTool(tool: any) { assert.ok(!tools.has(tool.name), `duplicate ${tool.name}`); tools.set(tool.name, tool); },
		getCommands: () => [...commands.entries()].map(([name, cmd]) => ({ name, source: "extension", description: cmd.description })),
		appendEntry(customType: string, data: any) {
			if (appendFailures.has(++appendCount)) throw new Error("disk full");
			const entry = { type: "custom", customType, data: structuredClone(data) };
			branch.push(entry); persisted.push(entry);
		},
		sendUserMessage(message: string) { messages.push({ user: message }); },
		sendMessage(message: any) {
			if (messagesFail) throw new Error("message delivery unavailable");
			messages.push(message);
		},
	};
	async function fire(name: string) {
		let result: any;
		for (const cb of handlers.get(name) ?? []) result = await cb({}, ctx) ?? result;
		return result;
	}
	piWorkflows(pi);
	// Provider attachment happens in a later sequential session_start handler.
	let off: Array<() => void> = [];
	pi.on("session_start", () => {
		off.forEach((detach) => detach());
		off = [
			events.on(DISCOVER, (request) => {
				for (const providerId of ids) events.emit(`${DISCOVER}:reply:${request.requestId}`, {
					requestId: request.requestId, providerId, instanceId: `${instance}`, version: 1, ready: true, capabilities: WORKFLOW_PROVIDER_CAPABILITIES,
				});
			}),
			events.on(REQUEST, (request) => {
				if (!ids.includes(request.providerId) || request.instanceId !== `${instance}`) return;
				requests.push(request);
				const p = request.payload;
				const profile = { agentId: p.expected?.agentId ?? p.agentId ?? "writer", path: "/agents/writer.md", hash: "hash" };
				const facts = { sessionPath: p.sessionPath ?? join(root, "role.jsonl"), profile,
					model: p.model ?? { provider: "test", model: "echo", thinking: "off" }, context: { tokens: 25, source: "saved" }, metadataConfirmed: true };
				let data: any;
				switch (request.operation) {
					case "ping": data = { alive: true }; break;
					case "profiles": data = { profiles: p.requiredAgents.map((agentId: string) => ({ ...profile, agentId })) }; break;
					case "launch": data = { ...facts, accepted: true }; break;
					case "inspect": case "resume": case "recover": data = facts; break;
					case "stop": data = { stopped: !stopFails }; break;
					case "update-metadata": data = { confirmed: true }; break;
				}
				const acknowledge = () => events.emit(`pi-workflows:provider:reply:${request.requestId}`, { ...request, ok: true, data });
				const deferred = deferredReplies.get(request.operation);
				if (deferred) {
					deferredReplies.delete(request.operation);
					deferred({ request, acknowledge });
				} else acknowledge();
			}),
		];
	});
	return {
		root, ctx, events, tools, commands, messages, notifications, prompts, requests, persisted, fire,
		start: async () => { await fire("session_start"); await fire("before_agent_start"); },
		command: async (args: string) => commands.get("workflow")!.handler(args, ctx),
		tool: async (name: string, args: any) => tools.get(name).execute("call", args, undefined, undefined, ctx),
		active: () => persisted.at(-1)?.data,
		deferReply(operation: "launch" | "stop" | "ping") {
			return new Promise<{ request: any; acknowledge: () => void }>((resolve) => {
				deferredReplies.set(operation, resolve);
			});
		},
		setChoice(value: string | null) { choice = value; },
		setProviders(...values: string[]) { ids.splice(0, ids.length, ...values); },
		setStopFails(value: boolean) { stopFails = value; },
		failMessages(value = true) { messagesFail = value; },
		setBranch(value: any[]) { branch = value; },
		failAppends(...numbers: number[]) { appendFailures = new Set(numbers.map((number) => number + appendCount)); },
		nextSession() { currentSession = "parent-two"; instance++; branch = []; },
		deliver(request: any, stopRequired = false, outcome: Record<string, unknown> = {}) {
			events.emit(DELIVERY, { ...request, kind: "result", result: {
				sessionPath: request.payload.sessionPath ?? join(root, "role.jsonl"), status: "completed", message: "done", changedFiles: [], stopRequired,
				...outcome,
			} });
		},
		ping(request: any) { events.emit(DELIVERY, { ...request, kind: "ping", message: "Question?" }); },
	};
}

test("sequential startup registers one owner and provider choice precedes model selection", async () => {
	await fixture(async (f) => {
		await f.start();
		assert.ok(f.commands.has("peter"));
		await f.command("list");
		assert.match(f.notifications.at(-1) ?? "", /peter/);
		await f.command("run docs-review Write docs.");
		assert.deepEqual(f.prompts.slice(0, 2), ["Workflow execution provider", "Select the workflow model policy"]);
		assert.equal(f.active().providerId, "second");
		const before = f.persisted.length;
		f.setChoice(null);
		await f.command("run docs-review Replace.");
		assert.equal(f.persisted.length, before);
		f.ctx.hasUI = false;
		await f.command("run docs-review No UI.");
		assert.equal(f.persisted.length, before);
	}, ["second", "first"]);
});

for (const shutdown of [true, false]) test(`two parent sessions rebind execution without duplicate registration or a disposed client (shutdown=${shutdown})`, async () => {
	await fixture(async (f) => {
		for (let i = 0; i < 2; i++) {
			await f.start();
			await f.command("run docs-review Write.");
			const ack = await f.tool("workflow_spawn", { runId: f.active().runId, role: "author", task: "Write." });
			assert.equal(ack.details.status, "started", JSON.stringify(ack));
			if (shutdown) await f.fire("session_shutdown");
			f.nextSession();
		}
		assert.equal(f.requests.filter((r) => r.operation === "launch").length, 2);
	});
});

test("durable append failure preserves the prior run; partial replacement clears unsafe in-memory state", async () => {
	await fixture(async (f) => {
		await f.start();
		await f.command("run docs-review First.");
		const old = f.active().runId;
		f.failAppends(1);
		await f.command("run docs-review Failed.");
		await f.command("status");
		assert.match(f.notifications.at(-1) ?? "", new RegExp(old));
		f.failAppends(2);
		await f.command("run docs-review Partial.");
		await f.command("status");
		assert.match(f.notifications.at(-1) ?? "", /No active workflow/);
	});
});

test("completion persistence failure is contained and blocks work until explicit reload", async () => {
	await fixture(async (f) => {
		await f.start(); await f.command("run docs-review Write.");
		const runId = f.active().runId;
		await f.tool("workflow_spawn", { runId, role: "author", task: "Write." });
		const request = [...f.requests].reverse().find((r) => r.operation === "launch");
		const durable = structuredClone(f.active());
		f.failAppends(1);
		f.deliver(request);
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(f.active(), durable, "failed terminal append must not publish a new state");
		assert.match(f.notifications.at(-1) ?? "", /disk full.*reload/i);
		const retry = await f.tool("workflow_spawn", { runId, role: "author", task: "Do not duplicate." });
		assert.match(retry.content[0].text, /reload/i);
		assert.equal(f.requests.filter((r) => r.operation === "launch").length, 1);
		await f.fire("session_shutdown"); await f.start();
		const resumed = await f.tool("workflow_resume", { runId, role: "author" });
		assert.equal(resumed.details.status, "started");
	});
});

for (const operation of ["launch", "resume", "recover"]) {
	for (const interruption of [false, true]) {
		for (const failedAppend of [false, true]) {
			test(`${operation} ${interruption ? "interruption" : "completion"} callback contains ${failedAppend ? "persistence" : "delivery"} errors`, async () => {
				await fixture(async (f) => {
					await f.start(); await f.command("run docs-review Write.");
					const runId = f.active().runId;
					await f.tool("workflow_spawn", { runId, role: "author", task: "Write." });
					let request = [...f.requests].reverse().find((r) => r.operation === "launch");
					if (operation !== "launch") {
						f.deliver(request);
						await new Promise((resolve) => setImmediate(resolve));
						await f.tool(`workflow_${operation}`, { runId, role: "author", failure: "quota exhausted" });
						request = [...f.requests].reverse().find((r) => r.operation === operation);
					}
					const durable = structuredClone(f.active());
					if (failedAppend) f.failAppends(1);
					f.failMessages();
					if (interruption) f.ping(request);
					else f.deliver(request);
					await new Promise((resolve) => setImmediate(resolve));
					assert.match(f.notifications.at(-1) ?? "", /Workflow result handling failed:.*(?:disk full|message delivery unavailable).*reload/i);
					if (failedAppend) assert.deepEqual(f.active(), durable);
					else assert.equal(f.active().activeLaunch.status, interruption ? "interrupted" : "completed");
					const retry = await f.tool("workflow_spawn", { runId, role: "author", task: "Do not duplicate." });
					assert.match(retry.content[0].text, /reload/i);
				});
			});
		}
	}
}

test("a failing diagnostic UI cannot leak a completion callback rejection", async (t) => {
	await fixture(async (f) => {
		await f.start(); await f.command("run docs-review Write.");
		await f.tool("workflow_spawn", { runId: f.active().runId, role: "author", task: "Write." });
		const request = [...f.requests].reverse().find((r) => r.operation === "launch");
		f.failMessages();
		f.ctx.ui.notify = () => { throw new Error("UI unavailable"); };
		const diagnostics: string[] = [];
		t.mock.method(console, "error", (message: string) => { diagnostics.push(message); throw new Error("stderr unavailable"); });
		f.deliver(request);
		await new Promise((resolve) => setImmediate(resolve));
		assert.match(diagnostics[0] ?? "", /message delivery unavailable.*reload/);
	});
});

test("restored legacy snapshots interrupt launches, preserve status on append failure and resume via their bound provider", async () => {
	await fixture(async (f) => {
		await f.start(); await f.command("run docs-review Write.");
		const runId = f.active().runId;
		await f.tool("workflow_spawn", { runId, role: "author", task: "Write." });
		const snapshot = structuredClone(f.active()); delete snapshot.providerId;
		await f.fire("session_shutdown");
		f.nextSession();
		f.setBranch([{ type: "custom", customType: "pi-tmux-subagents.workflow-run", data: snapshot }]);
		f.failAppends(1);
		await f.start();
		await f.command("status");
		assert.match(f.notifications.at(-1) ?? "", /interrupted/);
		f.failAppends();
		await f.commands.get("workflow-resume").handler("Continue.", f.ctx);
		const resumed = await f.tool("workflow_resume", { runId, role: "author" });
		assert.equal(resumed.details.status, "started", JSON.stringify(resumed));
		assert.ok(f.requests.some((r) => r.operation === "inspect"));
	});
});

test("failed pane cleanup blocks tree navigation until strict stop; stale results cannot cross branches", async () => {
	await fixture(async (f) => {
		await f.start(); await f.command("run docs-review Write.");
		const runId = f.active().runId;
		await f.tool("workflow_spawn", { runId, role: "author", task: "Write." });
		const request = [...f.requests].reverse().find((r) => r.operation === "launch");
		f.deliver(request, true);
		await new Promise((resolve) => setImmediate(resolve));
		await assert.rejects(f.tool("workflow_gate", { runId, gate: "plan", artifact: "guide" }), /no browser gate may overlap/);
		f.setStopFails(true);
		assert.equal((await f.fire("session_before_tree"))?.cancel, true);
		f.ctx.ui.notify = () => { throw new Error("UI unavailable"); };
		assert.equal((await f.fire("session_before_tree"))?.cancel, true);
		f.ctx.ui.notify = () => {};
		f.setStopFails(false);
		assert.notEqual((await f.fire("session_before_tree"))?.cancel, true);
		const count = f.messages.length;
		f.setBranch([]);
		await f.fire("session_tree");
		f.deliver(request);
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(f.messages.length, count);
	});
});

test("launch, resume and recovery retain coordinator ownership when post-launch confirmation and cleanup both fail", { timeout: 5_000 }, async (t) => {
	const outcomes: Array<Record<string, unknown>> = [];
	for (const timedOut of [false, true]) for (const operation of ["launch", "resume", "recover"] as const) await withParent(async (root) => {
		execFileSync("git", ["init", "-q", root]);
		const f = coordinatorFixture(root);
		const snapshot = savedRun(root);
		const sessionPath = join(root, "author.jsonl");
		const selection = { provider: MODEL.provider, model: MODEL.id, thinking: "off" as const };
		const agent = { agentId: "scribe", path: join(root, "agent/agents/scribe.md"),
			hash: hashText("scribe profile"), roleBodyHash: hashText("Write documentation.") };
		const profile: LaunchProfile = {
			version: 1,
			stable: { agentName: agent.agentId, displayName: "Author", roleBody: "Write documentation.",
				roleBodyHash: agent.roleBodyHash, systemPromptMode: "append", cwd: root, agentDir: join(root, "agent"),
				controls: { denyTools: [], interactive: false, sessionMode: "standalone" },
				originalSessionPath: sessionPath, createdAt: snapshot.startedAt },
			runtime: { originalModel: selection, lastModel: selection, resumeCount: 0 },
			resources: { tools: { hash: hashText(""), count: 0 }, visibleSkills: { hash: hashText(""), count: 0 }, updatedAt: snapshot.startedAt },
			workflow: { version: 1, workflowId: snapshot.workflowId, runId: snapshot.runId, roleId: "author",
				manifestHash: snapshot.manifestHash, skillHash: snapshot.skillHash, policy: snapshot.policy,
				assignmentSource: snapshot.assignmentSource, projectRoot: root, data: {},
				originalDefault: selection, currentDefault: selection },
		};
		const running: RunningSubagent = { id: "rolled-over-pane", name: "Author", task: "Continue writing.",
			sessionFile: join(root, "author-rollover.jsonl"), surface: "pane", startTime: 1,
			statusState: {} as RunningSubagent["statusState"], interactive: false };
		const sidecars = new Map([[sessionPath, profile]]);
		const requests: WorkflowProviderRequest[] = [];
		const stopped: RunningSubagent[] = [];
		let stopFails = true, executions = 0, freshLaunches = 0, modelWrites = 0;
		let navigationWaitedForLaunch = true, earlyNavigationCancelled = true;
		let started!: () => void, acknowledge!: () => void;
		const childStarted = new Promise<void>((resolve) => { started = resolve; });
		const acknowledgement = new Promise<void>((resolve) => { acknowledge = resolve; });
		const off = f.events.on(REQUEST, (request) => requests.push(request as WorkflowProviderRequest));
		const attached = attachTmuxWorkflowProvider({
			events: f.events, sessionId: f.ctx.sessionManager.getSessionId(), isAvailable: () => true,
			resolveProfile: (id) => id === agent.agentId ? agent : null,
			readProfile: (path) => {
				if (operation === "launch" && path === running.sessionFile) throw new Error("model sidecar is read only");
				return sidecars.get(path) ?? null;
			},
			updateProfile: (path, workflow) => { sidecars.set(path, { ...sidecars.get(path)!, workflow }); },
			recordLaunchedModel: (path) => {
				assert.equal(path, running.sessionFile, "confirmation must follow the launched rollover");
				modelWrites++;
				throw new Error("model sidecar is read only");
			},
			estimateContext: () => ({ tokens: 123, source: "saved" }),
			captureEvidence: () => ({ changedFiles: [] }), finishEvidence: () => ({ changedFiles: [] }),
			ctx: f.ctx as never, pi: f.pi as never,
			services: {
				async launchSubagent() {
					freshLaunches++;
					if (operation === "launch") {
						started();
						if (timedOut) await acknowledgement;
						return running;
					}
					throw new Error("unexpected fresh launch");
				},
				async watchSubagent() { throw new Error("saved launches use their resume lifecycle"); },
				async executeSubagentResume(_pi, params, _ctx, _recovery, lifecycle) {
					executions++;
					const saved = sidecars.get(params.sessionPath)!;
					sidecars.set(params.sessionPath, { ...saved, lineage: { rolledOverTo: running.sessionFile } });
					sidecars.set(running.sessionFile, { ...saved, lineage: { rolledOverFrom: params.sessionPath } });
					lifecycle?.onLaunched?.({ running, replacement: true, originalSessionPath: params.sessionPath,
						sessionPath: running.sessionFile, selection: lifecycle.workflowMetadata!.currentDefault! });
					started();
					if (timedOut) await acknowledgement;
					return { content: [{ type: "text" as const, text: "Session resumed" }],
						details: { status: "started", sessionPath: running.sessionFile } };
				},
				stopSubagent(child) {
					stopped.push(child);
					if (stopFails) throw new Error("pane could not close");
					child.surfaceClosed = true;
				},
			},
		});
		assert.ok(attached);
		try {
			piWorkflows(f.pi as never);
			f.restore({ ...snapshot, roleSessions: { author: { current: sessionPath, history: [sessionPath] } } });
			await f.emit("session_start"); await f.emit("before_agent_start");
			const params = { runId: snapshot.runId, role: "author", failure: "quota exhausted", task: "Write." };
			const toolName = operation === "launch" ? "workflow_spawn" : `workflow_${operation}`;
			if (timedOut) t.mock.timers.enable({ apis: ["setTimeout"] });
			const pending = f.tool(toolName, params);
			if (timedOut) {
				await childStarted;
				t.mock.timers.tick(operation === "launch" ? 30_000 : 120_000);
			}
			const result = await pending;
			if (timedOut) {
				assert.match(result.content[0].text, /request timed out/);
				let navigationFinished = false;
				const navigation = f.emit("session_before_tree").then((value) => {
					navigationFinished = true;
					return value;
				});
				await new Promise((resolve) => setImmediate(resolve));
				navigationWaitedForLaunch = !navigationFinished;
				acknowledge();
				earlyNavigationCancelled = (await navigation as any)?.cancel === true;
				t.mock.timers.reset();
			} else {
				assert.match(result.content[0].text, /model sidecar is read only/);
				assert.match(result.content[0].text, /pane could not close/);
			}
			assert.equal(executions + freshLaunches, 1, `${operation}: the child must actually launch`);
			assert.equal(modelWrites, timedOut || operation === "launch" ? 0 : 1, `${operation}: saved launches must reach model confirmation`);
			assert.ok(stopped.length > 0, `${operation}: adapter cleanup must have been attempted`);
			const launchStatus = f.entries.at(-1)?.data.activeLaunch?.status;
			const launched = requests.find((request) => request.operation === operation)!;

			// An undeclared slot prevents a broken ownership guard from opening a real browser.
			const gateError = await f.tool("workflow_gate", { runId: snapshot.runId, gate: "plan", artifact: "guide" })
				.then(() => "", (error: unknown) => String(error));
			const requestsBeforeDuplicate = requests.length;
			await f.tool(toolName, params);
			await f.tool("workflow_spawn", { runId: snapshot.runId, role: "author", task: "Do not duplicate." });
			const duplicateRequests = requests.slice(requestsBeforeDuplicate)
				.filter((request) => ["launch", "resume", "recover"].includes(request.operation)).length;
			const stopsBeforeNavigation = stopped.length;
			const navigation = await f.emit("session_before_tree");
			const stopsAfterNavigation = stopped.length;
			stopFails = false;
			const retry = await f.emit("session_before_tree");
			const stopRequest = [...requests].reverse().find((request) => request.operation === "stop");
			outcomes.push({
				operation, timedOut, launchStatus, gateBlockedByOwnership: /no browser gate may overlap/.test(gateError),
				navigationWaitedForLaunch, earlyNavigationCancelled,
				duplicateRequests, executions, freshLaunches,
				navigationCancelled: (navigation as any)?.cancel === true,
				navigationAttemptedStop: stopsAfterNavigation > stopsBeforeNavigation,
				retryAllowed: (retry as any)?.cancel !== true,
				retryStoppedChild: stopped.length === stopsAfterNavigation + 1 && running.surfaceClosed === true,
				sameChild: stopped.every((child) => child === running),
				sameOwner: isDeepStrictEqual(stopRequest?.owner, launched.owner),
				cleanupTarget: (stopRequest?.payload as { sessionPath?: string })?.sessionPath === (timedOut ? undefined : running.sessionFile),
			});
		} finally {
			acknowledge();
			t.mock.timers.reset();
			stopFails = false;
			try { await f.emit("session_shutdown"); }
			finally { attached.detach(); off(); }
		}
	});
	assert.deepEqual(outcomes, [false, true].flatMap((timedOut) => ["launch", "resume", "recover"].map((operation) => ({
		operation, timedOut, launchStatus: "interrupted", gateBlockedByOwnership: true,
		navigationWaitedForLaunch: true, earlyNavigationCancelled: true,
		duplicateRequests: 0, executions: operation === "launch" ? 0 : 1, freshLaunches: operation === "launch" ? 1 : 0,
		navigationCancelled: true, navigationAttemptedStop: true, retryAllowed: true,
		retryStoppedChild: true, sameChild: true, sameOwner: true, cleanupTarget: true,
	}))), "unconfirmed launched children must remain coordinator-owned until the same child is stopped");
});

test("tree navigation waits for a pending spawn and stops it once without unhandled rejection", { timeout: 3_000 }, async () => {
	await fixture(async (f) => {
		await f.start(); await f.command("run docs-review Write.");
		const launchReply = f.deferReply("launch");
		const spawn = f.tool("workflow_spawn", { runId: f.active().runId, role: "author", task: "Write." });
		const launch = await launchReply;

		let navigationFinished = false;
		const navigation = f.fire("session_before_tree").then((result) => {
			navigationFinished = true;
			return result;
		});
		const stopReply = f.deferReply("stop");
		launch.acknowledge();
		const stop = await stopReply;
		assert.equal(navigationFinished, false, "navigation must wait for confirmed cleanup");
		assert.deepEqual(stop.request.owner, launch.request.owner);
		assert.equal(stop.request.payload.sessionPath, join(f.root, "role.jsonl"));
		stop.acknowledge();

		const [spawnResult, navigationResult] = await Promise.all([spawn, navigation]);
		assert.match(spawnResult.content[0].text, /interrupted by branch navigation/);
		assert.notEqual(navigationResult?.cancel, true);
		await f.fire("session_tree");
		// Give Node a turn to report any unhandled lease rejection without intercepting it.
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(f.requests.filter((request) => request.operation === "stop").length, 1);
	});
});

test("a restored run never silently changes its unavailable provider", async () => {
	await fixture(async (f) => {
		await f.start(); await f.command("run docs-review Write.");
		const saved = structuredClone(f.active());
		await f.fire("session_shutdown");
		f.nextSession();
		f.setProviders("different");
		f.setBranch([{ type: "custom", customType: "pi-tmux-subagents.workflow-run", data: saved }]);
		await f.start();
		const messages = f.messages.length;
		await f.commands.get("workflow-resume").handler("Continue.", f.ctx);
		assert.match(f.notifications.at(-1) ?? "", /Bound workflow provider.*unavailable/);
		assert.equal(f.messages.length, messages);
		const outcome = await f.tool("workflow_spawn", { runId: saved.runId, role: "author", task: "Write." });
		assert.match(outcome.content[0].text, /Bound workflow provider.*unavailable/);
		assert.equal(f.requests.filter((r) => r.operation === "launch").length, 0);
	});
});

test("event recovery promotes a different model only after its correlated successful response", async () => {
	await fixture(async (f) => {
		await f.start(); await f.command("run docs-review Write.");
		const runId = f.active().runId;
		await f.tool("workflow_spawn", { runId, role: "author", task: "Write." });
		const launched = [...f.requests].reverse().find((r) => r.operation === "launch");
		f.deliver(launched);
		await new Promise((resolve) => setImmediate(resolve));
		const assignments = structuredClone(f.active().currentAssignments);
		f.ctx.modelRegistry.getAvailable = () => [{ ...f.ctx.model, id: "works", name: "Works" }];
		const result = await f.tool("workflow_recover", { runId, role: "author", failure: "quota exhausted" });
		assert.equal(result.details.status, "started", JSON.stringify(result));
		const recovered = [...f.requests].reverse().find((r) => r.operation === "recover");
		assert.equal(recovered.payload.workflow.assignmentSource, "recovery");
		assert.equal(recovered.payload.expected.contextTokens, 25);
		assert.deepEqual(f.active().currentAssignments, assignments);
		assert.match(recovered.payload.rolloverMessage, /Continue writing/);
		f.deliver({ ...recovered, owner: { ...recovered.owner, ownershipId: "stale" } }, false, { successfulResponse: true });
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(f.active().currentAssignments, assignments);
		f.deliver(recovered, false, { successfulResponse: true });
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(f.active().activeLaunch.status, "completed");
		assert.equal(f.active().currentAssignments?.author.model, "works");
		const writes = f.persisted.length;
		f.deliver(recovered, false, { successfulResponse: true });
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(f.persisted.length, writes, "duplicate response cannot promote twice");
	});
});

test("an acknowledged recovery that fails keeps the prior role default", async () => {
	await fixture(async (f) => {
		await f.start(); await f.command("run docs-review Write.");
		const runId = f.active().runId;
		await f.tool("workflow_spawn", { runId, role: "author", task: "Write." });
		f.deliver([...f.requests].reverse().find((r) => r.operation === "launch"));
		await new Promise((resolve) => setImmediate(resolve));
		const assignments = structuredClone(f.active().currentAssignments);
		const replacement = { ...f.ctx.model, id: "fails-too", name: "Fails too" };
		f.ctx.modelRegistry.getAvailable = () => [replacement];
		const ack = await f.tool("workflow_recover", { runId, role: "author", failure: "quota exhausted" });
		assert.equal(ack.details.status, "started", JSON.stringify(ack));
		const request = [...f.requests].reverse().find((r) => r.operation === "recover");
		assert.equal(request.payload.model.model, "fails-too");
		assert.deepEqual(f.active().currentAssignments, assignments, "launch acknowledgement is not recovery success");
		f.deliver(request, false, { status: "failed", message: "quota exhausted" });
		await new Promise((resolve) => setImmediate(resolve));
		assert.deepEqual(f.active().currentAssignments, assignments);
		assert.equal(f.active().activeLaunch.status, "failed");
	});
});

for (const outcome of ["cancelled", "stopped", "ping-only", "no-output", "provider-lost"]) {
	test(`recovery keeps the prior role default when ${outcome}`, { timeout: 5_000 }, async () => {
		await fixture(async (f) => {
			await f.start(); await f.command("run docs-review Write.");
			const runId = f.active().runId;
			await f.tool("workflow_spawn", { runId, role: "author", task: "Write." });
			f.deliver([...f.requests].reverse().find((r) => r.operation === "launch"));
			await new Promise((resolve) => setImmediate(resolve));
			const assignments = structuredClone(f.active().currentAssignments);
			f.ctx.modelRegistry.getAvailable = () => [{ ...f.ctx.model, id: "replacement", name: "Replacement" }];
			if (outcome === "cancelled") f.ctx.ui.select = async () => undefined;
			const ack = await f.tool("workflow_recover", { runId, role: "author", failure: "quota exhausted" });
			if (outcome === "cancelled") {
				assert.equal(ack.details.status, "cancelled");
				assert.equal(f.requests.filter((r) => r.operation === "recover").length, 0);
			} else {
				assert.equal(ack.details.status, "started");
				const request = [...f.requests].reverse().find((r) => r.operation === "recover");
				assert.equal(request.payload.model.model, "replacement");
				if (outcome === "stopped") await f.fire("session_before_tree");
				else if (outcome === "provider-lost") {
					const probe = await f.deferReply("ping");
					f.events.emit(`pi-workflows:provider:reply:${probe.request.requestId}`, {
						...probe.request, ok: false, error: "provider lost",
					});
				} else {
					if (outcome === "ping-only") f.ping(request);
					f.deliver(request);
				}
			}
			await new Promise((resolve) => setImmediate(resolve));
			assert.deepEqual(f.active().currentAssignments, assignments);
		});
	});
}

test("Peter's historical snapshot remains inspectable and resumes its saved planner through tmux binding", async () => {
	await fixture(async (f) => {
		f.setProviders("pi-tmux-subagents");
		await f.start(); await f.command("run peter Preserve the old plan.");
		const runId = f.active().runId;
		const plan = join(f.root, ".artifacts", "old", "PLAN.md");
		mkdirSync(dirname(plan), { recursive: true }); writeFileSync(plan, "# Existing plan\n");
		const launched = await f.tool("workflow_spawn", { runId, role: "planner", task: "Continue.", data: { plan } });
		assert.equal(launched.details.status, "started", JSON.stringify(launched));
		const historical = structuredClone(f.active());
		delete historical.providerId;
		await f.fire("session_shutdown"); f.nextSession();
		f.setBranch([{ type: "custom", customType: "pi-tmux-subagents.workflow-run", data: historical }]);
		await f.start();
		await f.command("status");
		assert.match(f.notifications.at(-1) ?? "", /peter/);
		await f.commands.get("workflow-resume").handler("Preserve the phase.", f.ctx);
		assert.match(f.messages.at(-1)?.user ?? "", /Preserve the phase/);
		const resumed = await f.tool("workflow_resume", { runId, role: "planner" });
		assert.equal(resumed.details.status, "started", JSON.stringify(resumed));
		assert.equal(f.active().data.plan, plan);
		assert.deepEqual(f.active().definition, historical.definition);
	});
});

test("terminal child help remains non-successful after persistence and restore", { timeout: 5_000 }, async () => {
	const outcomes: Array<Record<string, unknown>> = [];
	for (const operation of ["launch", "resume", "recover"] as const) await withParent(async (root) => {
		execFileSync("git", ["init", "-q", root]);
		const f = coordinatorFixture(root);
		const snapshot = savedRun(root);
		const sessionPath = join(root, "author.jsonl");
		const selection = { provider: MODEL.provider, model: MODEL.id, thinking: "off" as const };
		const agent = { agentId: "scribe", path: join(root, "agent/agents/scribe.md"),
			hash: hashText("scribe profile"), roleBodyHash: hashText("Write documentation.") };
		const profile: LaunchProfile = {
			version: 1,
			stable: { agentName: agent.agentId, displayName: "Author", roleBody: "Write documentation.",
				roleBodyHash: agent.roleBodyHash, systemPromptMode: "append", cwd: root, agentDir: join(root, "agent"),
				controls: { denyTools: [], interactive: false, sessionMode: "standalone" },
				originalSessionPath: sessionPath, createdAt: snapshot.startedAt },
			runtime: { originalModel: selection, lastModel: selection, resumeCount: 0 },
			resources: { tools: { hash: hashText(""), count: 0 }, visibleSkills: { hash: hashText(""), count: 0 }, updatedAt: snapshot.startedAt },
			workflow: { version: 1, workflowId: snapshot.workflowId, runId: snapshot.runId, roleId: "author",
				manifestHash: snapshot.manifestHash, skillHash: snapshot.skillHash, policy: snapshot.policy,
				assignmentSource: snapshot.assignmentSource, projectRoot: root, data: {},
				originalDefault: selection, currentDefault: selection },
		};
		const running: RunningSubagent = { id: "help-pane", name: "Author", task: "Continue writing.",
			sessionFile: sessionPath, surface: "pane", startTime: 1,
			statusState: {} as RunningSubagent["statusState"], interactive: false };
		const sidecars = new Map([[sessionPath, profile]]);
		const requests: WorkflowProviderRequest[] = [];
		let resumeLifecycle: { onResult?: (input: any) => unknown } | undefined;
		let watchResolve: ((result: any) => void) | undefined;
		const off = f.events.on(REQUEST, (request) => requests.push(request as WorkflowProviderRequest));
		const attached = attachTmuxWorkflowProvider({
			events: f.events, sessionId: f.ctx.sessionManager.getSessionId(), isAvailable: () => true,
			resolveProfile: (id) => id === agent.agentId ? agent : null,
			readProfile: (path) => sidecars.get(path) ?? null,
			updateProfile: (path, workflow) => { sidecars.set(path, { ...sidecars.get(path)!, workflow }); },
			recordLaunchedModel: (path, selected) => {
				const saved = sidecars.get(path)!;
				sidecars.set(path, { ...saved, runtime: { ...saved.runtime, lastModel: selected } });
			},
			estimateContext: () => ({ tokens: 123, source: "saved" }),
			captureEvidence: () => ({ changedFiles: [] }), finishEvidence: () => ({ changedFiles: [] }),
			ctx: f.ctx as never, pi: f.pi as never,
			services: {
				async launchSubagent(_params, _ctx, options) {
					sidecars.set(running.sessionFile, { ...profile, workflow: options!.workflow as never });
					return running;
				},
				async watchSubagent() {
					return new Promise((resolve) => { watchResolve = resolve as never; });
				},
				async executeSubagentResume(_pi, params, _ctx, _recovery, lifecycle) {
					resumeLifecycle = lifecycle;
					const saved = sidecars.get(params.sessionPath)!;
					sidecars.set(params.sessionPath, { ...saved, workflow: lifecycle!.workflowMetadata as never });
					sidecars.set(running.sessionFile, { ...saved, workflow: lifecycle!.workflowMetadata as never });
					lifecycle?.onLaunched?.({ running, replacement: false, originalSessionPath: params.sessionPath,
						sessionPath: running.sessionFile, selection: lifecycle.workflowMetadata!.currentDefault! });
					return { content: [{ type: "text" as const, text: "Session resumed" }],
						details: { status: "started", sessionPath: running.sessionFile } };
				},
				stopSubagent(child) { child.surfaceClosed = true; },
			},
		});
		assert.ok(attached);
		try {
			piWorkflows(f.pi as never);
			f.restore({ ...snapshot, roleSessions: { author: { current: sessionPath, history: [sessionPath] } } });
			await f.emit("session_start"); await f.emit("before_agent_start");
			const params = { runId: snapshot.runId, role: "author", task: "Continue writing.", failure: "quota exhausted" };
			const toolName = operation === "launch" ? "workflow_spawn" : `workflow_${operation}`;
			const ack = await f.tool(toolName, params);
			assert.equal(ack.details.status, "started", JSON.stringify(ack));
			running.surfaceClosed = true;
			const help = { name: "Author", task: "Continue writing.", summary: "needs help",
				sessionFile: running.sessionFile, exitCode: 0, elapsed: 1,
				ping: { name: "Author", message: "Need clarification" } };
			if (operation === "launch") watchResolve?.(help);
			else await resumeLifecycle?.onResult?.({ result: help, replacement: false,
				originalSessionPath: sessionPath, sessionPath: running.sessionFile });
			await until(() => f.messages.some((entry) => entry.message.customType === "subagent_result"));
			const persisted = structuredClone(f.entries.at(-1)?.data);
			const sent = f.messages.map((entry) => entry.message);
			const resultMessages = sent.filter((message) => message.customType === "subagent_result");
			outcomes.push({
				operation,
				status: persisted?.activeLaunch?.status,
				pingDelivered: sent.some((message) => message.customType === "subagent_ping"),
				resultStatus: resultMessages.at(-1)?.details?.status,
			});
			assert.equal(persisted?.activeLaunch?.status, "failed");
			assert.equal(persisted?.activeLaunch?.sessionPath, running.sessionFile);
			assert.equal(sent.some((message) => message.customType === "subagent_ping"), true);
			assert.equal(resultMessages.at(-1)?.details?.status, "failed");

			await f.emit("session_shutdown");
			f.setSession("parent-restored");
			f.setBranch([{ type: "custom", customType: "pi-tmux-subagents.workflow-run", data: persisted }]);
			await f.emit("session_start"); await f.emit("before_agent_start");
			const restoredStatus = await f.status();
			assert.match(restoredStatus, /failed/);
			assert.equal(persisted?.activeLaunch?.status, "failed");
		} finally {
			try { await f.emit("session_shutdown"); }
			finally { attached.detach(); off(); }
		}
	});
	assert.deepEqual(outcomes.map(({ operation, status, pingDelivered, resultStatus }) => ({ operation, status, pingDelivered, resultStatus })),
		["launch", "resume", "recover"].map((operation) => ({ operation, status: "failed", pingDelivered: true, resultStatus: "failed" })),
		"terminal child help requests must remain non-successful after persistence and restore");
});

test("abort, replacement and completion stop owned roles before changing runs", async () => {
	for (const action of ["abort", "replace", "complete"]) await fixture(async (f) => {
		await f.start(); await f.command("run docs-review First.");
		const runId = f.active().runId;
		await f.tool("workflow_spawn", { runId, role: "author", task: "Write." });
		const request = [...f.requests].reverse().find((r) => r.operation === "launch");
		if (action === "abort") await f.command("abort");
		else if (action === "replace") await f.command("run docs-review Replacement.");
		else await f.tool("workflow_complete", { runId, status: "completed" });
		assert.equal(f.requests.filter((r) => r.operation === "stop").length, 1);
		const count = f.messages.length, writes = f.persisted.length;
		f.deliver(request);
		await new Promise((resolve) => setImmediate(resolve));
		assert.equal(f.messages.length, count);
		assert.equal(f.persisted.length, writes);
	});
});
