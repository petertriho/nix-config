import assert from "node:assert/strict";
import test, { after } from "node:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OrdinaryExecutor } from "../runtime/ordinary-agents.ts";

// Import with a private HOME: Claude transcript copies must never reach the
// developer's real ~/.pi/agent/sessions/claude-code directory.
const root = mkdtempSync(join(tmpdir(), "pi-named-follow-up-"));
const savedEnv = { ...process.env };
const savedCwd = process.cwd();
for (const key of Object.keys(process.env)) {
	if (key.startsWith("PI_")) delete process.env[key];
}
process.env.HOME = root;
process.env.PI_CODING_AGENT_DIR = join(root, "agent");
process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS = "0";
process.env.TMUX = "/tmp/mock-tmux,1,0";
process.chdir(root);
const { default: register, __test__: testApi } = await import("../index.ts");
const { createNamedFollowUp } = await import("../runtime/named-followups.ts");
const { createSessionState } = await import("../runtime/session-state.ts");
const { registerAgentTool } = await import("../registration/agent-tool.ts");

after(() => {
	process.chdir(savedCwd);
	for (const key of Object.keys(process.env)) {
		if (!(key in savedEnv)) delete process.env[key];
	}
	Object.assign(process.env, savedEnv);
	rmSync(root, { recursive: true, force: true });
});

type AnyRecord = Record<string, any>;

test("Agent awaits the callable executor once, forwards controls, and marks service errors", async () => {
	const tools = new Map<string, AnyRecord>();
	const calls: Parameters<OrdinaryExecutor>[] = [];
	const failure = { content: [{ type: "text" as const, text: "No launch" }], details: { error: "cancelled" } };
	const execute: OrdinaryExecutor = async (...args) => { calls.push(args); return failure; };
	const interrupted: AnyRecord[] = [];
	registerAgentTool(
		{ registerTool: (tool: AnyRecord) => tools.set(tool.name, tool) } as never,
		{ loadAgentDefaults: () => ({ cli: "claude" }) } as never,
		{ handleSubagentInterrupt: (params: AnyRecord) => { interrupted.push(params); return failure; } } as never,
		{} as never, execute, {} as never,
		() => { throw new Error("An ordinary Agent must not launch a teammate"); },
		() => true,
	);
	const ctx = { mode: "print" };
	const signal = new AbortController().signal;
	const onUpdate = () => {};
	const order: string[] = [];
	const resultPromise = tools.get("Agent")!.execute("callable", {
		description: "Review", prompt: "Review files", name: "Reviewer", subagent_type: "reviewer",
		run_in_background: true, model: "inherit",
	}, signal, onUpdate, ctx);
	const [result] = await Promise.all([
		resultPromise.then((value: AnyRecord) => { order.push("settled"); return value; }),
		Promise.resolve().then(() => { order.push("first"); }).then(() => { order.push("second"); }),
	]);
	assert.deepEqual(order, ["first", "settled", "second"], "Agent must retain one await at the service boundary");
	assert.equal(result.isError, true);
	assert.equal(result.details, failure.details);
	assert.equal(calls.length, 1);
	const [id, params, forwardedSignal, forwardedUpdate, forwardedCtx] = calls[0];
	assert.equal(id, "callable");
	assert.equal(params.name, "Reviewer");
	assert.equal(params.task, "Review files");
	assert.equal(params.agent, "reviewer");
	assert.equal(params.model, "inherit");
	assert.equal(params.runInForeground, false);
	assert.equal(params.followUpName, "Reviewer");
	assert.equal(forwardedSignal, signal);
	assert.equal(forwardedUpdate, onUpdate);
	assert.equal(forwardedCtx, ctx);
	const interruptParams = { name: "Reviewer" };
	assert.strictEqual(await tools.get("AgentInterrupt")!.execute("interrupt", interruptParams), failure);
	assert.deepEqual(interrupted, [interruptParams]);
});

for (const rejects of [false, true]) {
	test(`Claude callable follow-up restores saved state before ${rejects ? "rejection" : "error settlement"} without another await`, async () => {
		const session = createSessionState();
		const saved = {
			backend: "claude" as const, id: "old", claudeSessionId: "claude-session",
			launch: { agent: "reviewer", cwd: "/original", model: "inherit", interactive: false },
		};
		session.finishedOrdinary.set("Reviewer", saved);
		const failure = new Error("Launch failed");
		const calls: Parameters<OrdinaryExecutor>[] = [];
		const execute: OrdinaryExecutor = async (...args) => {
			calls.push(args);
			if (rejects) throw failure;
			return { content: [{ type: "text", text: "No launch" }], details: { error: "tmux not available" } };
		};
		const followUp = createNamedFollowUp(
			{} as never, { loadAgentDefaults: () => ({ cli: "claude" }) } as never,
			{ runningSubagents: new Map() } as never, {} as never, execute, session,
		);
		const signal = new AbortController().signal;
		const ctx = {} as never;
		const onUpdate = () => {};
		const order: string[] = [];
		const response = followUp("followup", { recipient: "Reviewer", content: "Continue" }, signal, onUpdate, ctx);
		const settled = response.then(
			(result) => {
				assert.equal(rejects, false);
				assert.equal(result.isError, true);
				order.push("settled");
			},
			(error) => {
				assert.equal(rejects, true);
				assert.strictEqual(error, failure);
				order.push("settled");
			},
		).then(() => {
			assert.strictEqual(session.finishedOrdinary.get("Reviewer"), saved);
			assert.equal(session.followUpsInFlight.size, 0);
		});
		await Promise.all([
			settled,
			Promise.resolve().then(() => { order.push("first"); }).then(() => { order.push("second"); }),
		]);
		assert.deepEqual(order, ["first", "settled", "second"]);
		assert.equal(calls.length, 1);
		const [id, params, forwardedSignal, forwardedUpdate, forwardedCtx] = calls[0];
		assert.equal(id, "followup");
		assert.equal(params.resumeSessionId, "claude-session");
		assert.equal(params.task, "Continue");
		assert.equal(params.cwd, "/original");
		assert.equal(params.model, "inherit");
		assert.equal(params.followUpName, "Reviewer");
		assert.equal(typeof params.followUpLifecycle?.onResult, "function");
		assert.equal(typeof params.followUpLifecycle?.onError, "function");
		assert.equal(forwardedSignal, signal);
		assert.equal(forwardedUpdate, onUpdate);
		assert.equal(forwardedCtx, ctx);
	});
}

function fixture(backend: "pi" | "claude") {
	const dir = mkdtempSync(join(root, `${backend}-`));
	const cwd = join(dir, "working-directory");
	const agentsDir = join(process.env.PI_CODING_AGENT_DIR!, "agents");
	mkdirSync(cwd);
	mkdirSync(agentsDir, { recursive: true });
	const agentName = `follow-up-${backend}`;
	writeFileSync(join(agentsDir, `${agentName}.md`),
		`---\nname: ${agentName}\nauto-exit: true\n${backend === "claude" ? "cli: claude\n" : ""}---\n\nKeep the original role.\n`);
	const log = join(dir, "scripts.log");
	const transcript = join(dir, "claude-session-id.jsonl");
	writeFileSync(transcript, "{}\n");
	const tmux = join(dir, "tmux");
	writeFileSync(tmux, [
		"#!/usr/bin/env node",
		'const fs = require("node:fs");',
		"const args = process.argv.slice(2);",
		'if (args[0] === "split-window") process.stdout.write("%739\\n");',
		'if (args[0] === "send-keys" && args[3] === "-l") {',
		'  const path = args[4].match(/^bash \'([^\']+)\'$/)?.[1];',
		'  if (!path) process.exit(2);',
		'  const script = fs.readFileSync(path, "utf8");',
		`  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(script) + "\\n");`,
		`  if (fs.existsSync(${JSON.stringify(join(dir, "hold"))})) process.exit(0);`,
		'  const sentinel = script.match(/PI_CLAUDE_SENTINEL=\'([^\']+)\'/)?.[1];',
		`  if (fs.existsSync(${JSON.stringify(join(dir, "fail"))})) {`,
		'    if (sentinel) {',
		'      const status = script.match(/ > \'([^\']+\\.status)\'/)?.[1];',
		'      if (!status) process.exit(4);',
		'      fs.writeFileSync(status, "7\\n");',
		'    } else {',
		'      const session = script.match(/PI_SUBAGENT_SESSION=\'([^\']+)\'/)?.[1];',
		'      fs.appendFileSync(session, JSON.stringify({ type: "message", id: "failed", message: { role: "assistant", stopReason: "error", content: [], errorMessage: "quota exhausted" } }) + "\\n");',
		'      fs.writeFileSync(session + ".exit", JSON.stringify({ type: "error", errorMessage: "quota exhausted" }));',
		'    }',
		'    process.exit(0);',
		'  }',
		'  if (sentinel) {',
		`    fs.writeFileSync(sentinel + ".transcript", ${JSON.stringify(transcript)});`,
		'    fs.writeFileSync(sentinel, "Claude finished.\\n");',
		"  } else {",
		'    const session = script.match(/PI_SUBAGENT_SESSION=\'([^\']+)\'/)?.[1];',
		'    if (!session) process.exit(3);',
		'    fs.writeFileSync(session, JSON.stringify({ type: "message", id: "reply", message: { role: "assistant", content: [{ type: "text", text: "Pi finished." }] } }) + "\\n");',
		'    fs.writeFileSync(session + ".exit", JSON.stringify({ type: "done" }));',
		"  }",
		"}",
	].join("\n") + "\n");
	chmodSync(tmux, 0o755);
	process.env.PATH = `${dir}:${savedEnv.PATH ?? ""}`;
	const tools = new Map<string, AnyRecord>();
	const handlers = new Map<string, Array<(event: AnyRecord, ctx: AnyRecord) => unknown>>();
	const messages: AnyRecord[] = [];
	const queued: AnyRecord[] = [];
	let waiting: ((value: AnyRecord) => void) | undefined;
	register({
		on: (event: string, handler: (event: AnyRecord, ctx: AnyRecord) => unknown) => {
			handlers.set(event, [...(handlers.get(event) ?? []), handler]);
		},
		registerTool: (tool: AnyRecord) => tools.set(tool.name, tool),
		registerCommand() {},
		registerShortcut() {},
		registerMessageRenderer() {},
		getCommands: () => [],
		getAllTools: () => [],
		sendMessage: (message: AnyRecord, options: AnyRecord) => {
			const value = { message, options };
			messages.push(value);
			if (waiting) {
				const resolve = waiting;
				waiting = undefined;
				resolve(value);
			} else queued.push(value);
		},
	} as any);
	const model = {
		provider: "anthropic", id: "claude", name: "Claude",
		contextWindow: 200_000, maxTokens: 16_000, reasoning: true,
	};
	const ctx = {
		cwd: dir, hasUI: false, mode: "print",
		model,
		modelRegistry: { getAvailable: () => [model] },
		sessionManager: {
			getSessionFile: () => join(dir, "parent.jsonl"),
			getSessionId: () => "parent",
			getSessionDir: () => dir,
		},
		ui: { notify() {}, setWidget() {} },
	};
	const execute = (name: string, params: AnyRecord, signal = new AbortController().signal) =>
		tools.get(name)!.execute("call", params, signal, () => {}, ctx);
	const nextResult = async () => queued.length ? queued.shift()! : new Promise<AnyRecord>((resolve) => { waiting = resolve; });
	return {
		dir, cwd, agentName, messages, execute, nextResult, ctx,
		scripts: (): string[] => readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line)),
		shutdown: async () => {
			const running = [...testApi.runningSubagents.values()] as AnyRecord[];
			for (const handler of handlers.get("session_shutdown") ?? []) await handler({ reason: "new" }, ctx);
			// Shutdown aborts watchers but does not await pending async tmux
			// reads. Keep the fake tmux in PATH until those reads settle.
			for (let attempt = 0; running.some((agent) => !agent.surfaceClosed) && attempt < 200; attempt++) {
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			assert.ok(running.every((agent) => agent.surfaceClosed), "watchers must close their panes before fixture cleanup");
			testApi.rearmModuleAbortController();
		},
	};
}

test("Agent resume carries caller cancellation across the asynchronous context gate", { timeout: 10_000 }, async () => {
	const f = fixture("pi");
	try {
		const finished = await f.execute("Agent", {
			description: "Review", prompt: "Review files", name: "Reviewer",
			subagent_type: f.agentName, run_in_background: false,
		});
		const sessionPath = finished.details.sessionFile;
		writeFileSync(sessionPath, [
			{ type: "session", version: 3, id: "saved", cwd: f.cwd, timestamp: new Date().toISOString() },
			{
			type: "message", id: "answer", parentId: null, timestamp: new Date().toISOString(), message: {
				role: "assistant", content: [{ type: "text", text: "Earlier answer" }],
				stopReason: "stop", usage: { input: 160_000, output: 1, cacheRead: 0, cacheWrite: 0 },
			},
			},
		].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
		const caller = new AbortController();
		let prompted = false;
		Object.assign(f.ctx, {
			hasUI: true,
			ui: { notify() {}, async select() {
				prompted = true;
				caller.abort();
				return "Resume the saved session anyway";
			} },
		});
		await assert.rejects(f.execute("Agent", {
			description: "Continue", prompt: "Continue review", subagent_type: f.agentName,
			resume: sessionPath, model: "previous",
		}, caller.signal), /cancelled/);
		assert.equal(prompted, true);
		assert.equal(f.scripts().length, 1, "a cancelled resume must not dispatch another command");
	} finally {
		await f.shutdown();
	}
});

for (const backend of ["claude", "pi"] as const) {
	for (const background of [false, true]) {
		test(`SendMessage resumes a finished named ${backend} agent (${background ? "background" : "foreground"})`, { timeout: 10_000 }, async () => {
			const f = fixture(backend);
			try {
				const started = await f.execute("Agent", {
					description: "Review", prompt: "Review the files", name: "Reviewer",
					subagent_type: f.agentName, cwd: f.cwd, run_in_background: background,
				});
				const finished = background ? (await f.nextResult()).message : started;
				assert.equal(finished.details.exitCode, 0);
				assert.equal(testApi.runningSubagents.size, 0);
				const reference = backend === "claude" ? finished.details.claudeSessionId : finished.details.sessionFile;
				assert.ok(reference);
				assert.equal((await f.execute("ListAgents", {})).details.agents[0]?.status, "finished");

				for (let round = 1; round <= 2; round++) {
					const content = `Follow-up number ${round}`;
					const response = await f.execute("SendMessage", { recipient: "Reviewer", content });
					assert.equal(response.details.status, "started", JSON.stringify(response));
					const delivered = await f.nextResult();
					assert.equal(delivered.message.details.exitCode, 0);
					assert.equal(delivered.options.deliverAs, "steer");
					assert.equal(delivered.options.triggerTurn, true);
					assert.equal(delivered.message.details[backend === "claude" ? "claudeSessionId" : "sessionFile"], reference);
					const scripts = f.scripts();
					assert.equal(scripts.length, round + 1, "one new pane per follow-up");
					const script = scripts[round];
					assert.ok(script.includes(`cd '${f.cwd}' &&`), "resume must use the original cwd");
					if (backend === "claude") {
						assert.match(script, /claude --dangerously-skip-permissions/);
						assert.ok(script.includes(`--resume '${reference}'`));
						assert.ok(script.includes(`'${content}'`));
						assert.doesNotMatch(script, /PI_SUBAGENT_SESSION=|--session /);
					} else {
						assert.ok(script.includes(`--session '${reference}'`));
						const messagePath = script.match(/# Resume message file: (.+)/)?.[1];
						assert.ok(messagePath);
						assert.equal(readFileSync(messagePath, "utf8"), content);
					}
					assert.equal((await f.execute("ListAgents", {})).details.agents[0]?.status, "finished");
				}
			} finally {
				await f.shutdown();
			}
		});
	}
}

test("Claude follow-up launch failure preserves the finished record for retry", { timeout: 10_000 }, async () => {
	const f = fixture("claude");
	try {
		await f.execute("Agent", {
			description: "Review", prompt: "Review files", name: "Reviewer",
			subagent_type: f.agentName, run_in_background: false,
		});
		delete process.env.TMUX;
		const failed = await f.execute("SendMessage", { recipient: "Reviewer", content: "Try again" });
		assert.equal(failed.details.error, "tmux not available");
		process.env.TMUX = "/tmp/mock-tmux,1,0";
		const retry = await f.execute("SendMessage", { recipient: "Reviewer", content: "Try again" });
		assert.equal(retry.details.status, "started");
		assert.equal((await f.nextResult()).message.details.exitCode, 0);
		assert.equal(f.scripts().length, 2);
	} finally {
		process.env.TMUX = "/tmp/mock-tmux,1,0";
		await f.shutdown();
	}
});

for (const backend of ["pi", "claude"] as const) {
	test(`unsuccessful terminal ${backend} follow-up retains the named saved session for retry`, { timeout: 10_000 }, async () => {
		const f = fixture(backend);
		try {
			const finished = await f.execute("Agent", {
				description: "Review", prompt: "Review files", name: "Reviewer",
				subagent_type: f.agentName, run_in_background: false,
			});
			const referenceKey = backend === "pi" ? "sessionFile" : "claudeSessionId";
			const original = finished.details[referenceKey];
			writeFileSync(join(f.dir, "fail"), "");
			const failed = await f.execute("SendMessage", { recipient: "Reviewer", content: "Continue" });
			assert.equal(failed.details.status, "started");
			assert.notEqual((await f.nextResult()).message.details.exitCode, 0);
			assert.equal((await f.execute("ListAgents", {})).details.agents[0]?.status, "finished");
			rmSync(join(f.dir, "fail"));
			const retry = await f.execute("SendMessage", { recipient: "Reviewer", content: "Retry" });
			assert.equal(retry.details.status, "started", JSON.stringify(retry));
			const delivered = await f.nextResult();
			assert.equal(delivered.message.details.exitCode, 0);
			assert.equal(delivered.message.details[referenceKey], original);
			assert.equal(f.scripts().length, 3);
		} finally {
			await f.shutdown();
		}
	});
}

test("Claude follow-ups reject concurrent messages and cannot repopulate records after shutdown", { timeout: 10_000 }, async () => {
	const f = fixture("claude");
	try {
		await f.execute("Agent", {
			description: "Review", prompt: "Review files", name: "Reviewer",
			subagent_type: f.agentName, run_in_background: false,
		});
		writeFileSync(join(f.dir, "hold"), "");
		const first = f.execute("SendMessage", { recipient: "Reviewer", content: "Continue" });
		const second = await f.execute("SendMessage", { recipient: "Reviewer", content: "Duplicate" });
		assert.match(second.details.error, /already running|still running/);
		assert.equal((await first).details.status, "started");
		await f.shutdown();
		assert.equal(f.messages.length, 0, "a stale watcher must not send a result");
		assert.deepEqual((await f.execute("ListAgents", {})).details.agents, []);
		assert.match((await f.execute("SendMessage", { recipient: "Reviewer", content: "Later" })).details.error,
			/No finished ordinary named agent/);
	} finally {
		await f.shutdown();
	}
});
