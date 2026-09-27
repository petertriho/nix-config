import assert from "node:assert/strict";
import test, { after } from "node:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

after(() => {
	process.chdir(savedCwd);
	for (const key of Object.keys(process.env)) {
		if (!(key in savedEnv)) delete process.env[key];
	}
	Object.assign(process.env, savedEnv);
	rmSync(root, { recursive: true, force: true });
});

type AnyRecord = Record<string, any>;

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
	const execute = (name: string, params: AnyRecord) =>
		tools.get(name)!.execute("call", params, new AbortController().signal, () => {}, ctx);
	const nextResult = async () => queued.length ? queued.shift()! : new Promise<AnyRecord>((resolve) => { waiting = resolve; });
	return {
		dir, cwd, agentName, messages, execute, nextResult,
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
