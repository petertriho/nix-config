import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import subagents, { __test__ } from "../pi-tmux-subagents/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const extension = resolve(here, "../pi-tmux-subagents");
const attached = process.env.TMUX && spawnSync("tmux", ["display-message", "-p", "#{pane_id}"], {
  encoding: "utf8",
});
if (!attached || attached.status !== 0 || !attached.stdout.trim()) {
  throw new Error("test:tmux-smoke needs a real attached tmux pane");
}
const listing = execFileSync("pi", ["list"], { encoding: "utf8" });
const nativePackage = listing.match(/(\/nix\/store\/[^\s]+-pi-tasks-[^\s]+\/lib\/node_modules\/pi-tasks)/)?.[1];
if (!nativePackage) throw new Error("Installed pi-tasks package could not be found");
const nativeExtension = join(nativePackage, "src", "index.ts");
const root = mkdtempSync(join(tmpdir(), "pi-real-team-smoke-"));
const original = {
  agentDir: process.env.PI_CODING_AGENT_DIR,
  delay: process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS,
  tasks: process.env.PI_TASKS,
};
let pane;
try {
  const cwd = join(root, "workspace");
  const agentDir = join(root, "agent");
  const extensions = join(agentDir, "extensions");
  const sessionDir = join(root, "sessions");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(extensions, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  const configSource = join(root, "tasks-config.json");
  writeFileSync(configSource, '{"autoClearCompleted":"never"}');
  symlinkSync(configSource, join(agentDir, "tasks-config.json"));
  writeFileSync(join(extensions, "pi-tmux-subagents.ts"),
    `export { default } from ${JSON.stringify(join(extension, "index.ts"))};\n`);
  writeFileSync(join(extensions, "pi-tasks.ts"),
    `export { default } from ${JSON.stringify(nativeExtension)};\n`);
  writeFileSync(join(extensions, "team-smoke-provider.ts"),
    `export { default } from ${JSON.stringify(join(here, "fake-provider.ts"))};\n`);
  process.env.PI_CODING_AGENT_DIR = agentDir;
  delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS = "0";
  const taskPath = join(root, "shared-tasks.json");
  process.env.PI_TASKS = taskPath;
  const parentId = randomUUID();
  const parentFile = join(sessionDir, "parent.jsonl");
  writeFileSync(parentFile, JSON.stringify({
    type: "session", version: 3, id: parentId, timestamp: new Date().toISOString(), cwd,
  }) + "\n");
  const handlers = new Map();
  const tools = new Map();
  const commands = new Set();
  const pi = {
    events: { on: () => () => {}, emit() {} },
    on(name, handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    registerTool(tool) { tools.set(tool.name, tool); },
    registerCommand(name) { commands.add(name); },
    registerShortcut() {},
    registerMessageRenderer() {},
    sendMessage() {},
    sendUserMessage() {},
    getActiveTools() { return []; },
    getAllTools() { return []; },
    getCommands() { return []; },
  };
  subagents(pi);
  assert.equal(commands.has("team-reconcile"), false, "manual reconciliation command must be removed");
  const context = {
    cwd, mode: "tui", hasUI: true, thinkingLevel: "off",
    sessionManager: {
      getSessionFile: () => parentFile,
      getSessionId: () => parentId,
      getSessionDir: () => sessionDir,
    },
    modelRegistry: { getAvailable: () => [] },
    scopedModels: [],
    ui: {
      confirm: async (_title, message) => {
        assert.match(message, /SmokeTask/, "the fake lead UI must see the full exact task call");
        return true;
      },
      select: async () => undefined, notify() {},
      setWidget() {}, setStatus() {}, setTitle() {},
      theme: {
        fg: (_token, text) => text, bg: (_token, text) => text, bold: (text) => text,
      },
    },
  };
  for (const handler of handlers.get("session_start") ?? []) {
    await handler({ reason: "startup" }, context);
  }
  const agent = tools.get("Agent");
  assert.ok(agent, "Agent tool must be registered");
  const result = await agent.execute("smoke-agent", {
    description: "Test the isolated team handshake",
    prompt: "Use the offline smoke model.",
    subagent_type: "worker", name: "SmokeWorker", interactive: true,
    model: "team-smoke/mock",
  }, new AbortController().signal, () => {}, context);
  assert.equal(result.details?.status, "started", JSON.stringify(result));
  pane = __test__.runningSubagents.get(result.details.id)?.surface;
  assert.ok(pane, "a real tmux pane must back the admitted teammate");
  const memberId = result.details.memberId;
  const list = await tools.get("ListAgents").execute(
    "smoke-list", {}, new AbortController().signal, () => {}, context,
  );
  assert.ok(list.details.agents.some((entry) => entry.id === memberId && entry.name === "SmokeWorker"));
  const deadline = Date.now() + 15_000;
  while (!existsSync(taskPath) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(existsSync(taskPath), "real Pi must intercept and commit the teammate TaskCreate");
  const taskFile = readFileSync(taskPath, "utf8");
  assert.deepEqual(JSON.parse(taskFile).tasks.map((task) => task.subject),
    ["SmokeTask"], "the native task file must contain exactly one approved task");
  const running = __test__.runningSubagents.get(result.details.id);
  assert.ok(running, "the teammate must still have an owned pane");
  let correlated;
  const resultDeadline = Date.now() + 10_000;
  while (!correlated && Date.now() < resultDeadline) {
    if (existsSync(running.sessionFile)) {
      for (const line of readFileSync(running.sessionFile, "utf8").split("\n").filter(Boolean)) {
        const entry = JSON.parse(line);
        if (entry.type === "message" && entry.message?.role === "toolResult" &&
            entry.message.toolName === "TaskCreate") correlated = entry.message;
      }
    }
    if (!correlated) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(correlated, "real Pi must persist the correlated blocked-call replacement");
  assert.equal(correlated.isError, false, JSON.stringify(correlated));
  assert.match(correlated.content[0].text, /TaskCreate committed: #1 SmokeTask/);
  const roster = join(sessionDir, "artifacts", parentId, "team", "main", "roster.json");
  let ledgerMatches = false;
  const ledgerDeadline = Date.now() + 5_000;
  while (!ledgerMatches && Date.now() < ledgerDeadline) {
    const snapshot = JSON.parse(readFileSync(roster, "utf8"));
    ledgerMatches = snapshot.taskFingerprint ===
      createHash("sha256").update(readFileSync(taskPath, "utf8")).digest("hex");
    if (!ledgerMatches) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(ledgerMatches, true, "the lead must record the authorized task commit");
  const nativeChange = JSON.parse(readFileSync(taskPath, "utf8"));
  nativeChange.tasks[0].description = "Native lead updated this task";
  writeFileSync(taskPath, JSON.stringify(nativeChange, null, 2));
  for (const handler of handlers.get("tool_result") ?? []) {
    await handler({
      toolName: "TaskUpdate", toolCallId: "native-lead-update",
      input: { taskId: "1", description: "Native lead updated this task" },
      isError: false, content: [{ type: "text", text: "Task updated" }],
    }, context);
  }
  const rebased = JSON.parse(readFileSync(roster, "utf8"));
  assert.equal(rebased.pauseReason, undefined, "a valid native lead update must not pause team writes");
  assert.equal(rebased.taskFingerprint,
    createHash("sha256").update(readFileSync(taskPath, "utf8")).digest("hex"),
    "the lead must advance the baseline after a safe native update");
  const probeSession = join(sessionDir, "stop-probe.jsonl");
  const escape = (value) => `'${value.replaceAll("'", "'\\''")}'`;
  const probeCommand = [
    "env PI_TEAM_SMOKE_STOP_PROBE=1 pi --no-extensions",
    "-e", escape(join(extensions, "pi-tasks.ts")),
    "-e", escape(join(extensions, "team-smoke-provider.ts")),
    "-e", escape(join(here, "stop-probe.ts")),
    "--model team-smoke/mock --session", escape(probeSession),
    escape("Run the stop probe"),
  ].join(" ");
  const probeLaunch = spawnSync("tmux", [
    "split-window", "-P", "-F", "#{pane_id}", "-d", "-c", cwd, probeCommand,
  ], { encoding: "utf8" });
  assert.equal(probeLaunch.status, 0, probeLaunch.stderr);
  const probePane = probeLaunch.stdout.trim();
  let probeResult;
  try {
    const probeDeadline = Date.now() + 20_000;
    while (!probeResult && Date.now() < probeDeadline) {
      if (existsSync(probeSession)) {
        for (const line of readFileSync(probeSession, "utf8").split("\n").filter(Boolean)) {
          const entry = JSON.parse(line);
          if (entry.type === "message" && entry.message?.role === "toolResult" &&
              entry.message.toolName === "TaskStop") probeResult = entry.message;
        }
      }
      if (!probeResult) await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    spawnSync("tmux", ["kill-pane", "-t", probePane], { stdio: "ignore" });
  }
  assert.ok(probeResult, "real Pi must save the blocked TaskStop result");
  assert.equal(probeResult.isError, false);
  assert.equal(probeResult.content[0].text,
    "Qualified stop correlated through real Pi message_end");
  const stopEvent = {
    toolName: "TaskStop", toolCallId: "smoke-stop",
    input: { task_id: `team:${memberId}` },
  };
  let blocked;
  for (const handler of handlers.get("tool_call") ?? []) {
    const outcome = await handler(stopEvent, context);
    if (outcome?.block) { blocked = outcome; break; }
  }
  assert.equal(blocked?.block, true);
  for (const handler of handlers.get("message_end") ?? []) {
    const replacement = await handler({
      message: {
        role: "toolResult", toolName: "TaskStop", toolCallId: "smoke-stop",
        content: [{ type: "text", text: blocked.reason }],
        isError: true, timestamp: Date.now(),
      },
    }, context);
    if (replacement?.message) {
      assert.equal(replacement.message.isError, false);
      assert.match(replacement.message.content[0].text, /stopped successfully/);
      break;
    }
  }
  console.log("real attached-tmux startup, approved task commit, automatic native rebase and qualified stop passed");
  for (const handler of handlers.get("session_shutdown") ?? []) {
    await handler({}, context);
  }
} finally {
  if (pane) spawnSync("tmux", ["kill-pane", "-t", pane], { stdio: "ignore" });
  for (const [key, value] of [
    ["PI_CODING_AGENT_DIR", original.agentDir],
    ["PI_SUBAGENT_SHELL_READY_DELAY_MS", original.delay],
    ["PI_TASKS", original.tasks],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
}
