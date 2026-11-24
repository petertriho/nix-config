import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { CliOptions, CliResult, ListedAgent, PullRecord } from "../cli.ts";
import { hasLiveAgent, registerLeadMode } from "../lead.ts";
import { RESULT_TYPE } from "../presentation/renderers.ts";
import { WIDGET_KEY } from "../presentation/widget.ts";
import { listArgs, readArgs, registerTools, sendArgs, spawnArgs, trailerFields } from "../tools.ts";

type Handler = (event: Record<string, unknown>, ctx: unknown) => unknown;
type Call = { args: string[]; options?: CliOptions };
type Tool = {
  name: string;
  execute: (id: string, params: Record<string, unknown>, signal: AbortSignal | undefined, onUpdate: unknown, ctx: unknown) =>
    Promise<{ content: Array<{ text: string }>; details: Record<string, unknown>; isError?: boolean }>;
};

const TRAILER = "pi-tmux-agents: id=a1b2c3 target=repo:api pane=%5 turn=0 event=spawn";

function listed(overrides: Partial<ListedAgent> = {}): ListedAgent {
  return {
    id: "a1b2c3", name: "api", lead_session: "lead-1", session: "repo", window: "api", pane: "%5",
    target: "repo:api", cwd: "/work/api", dir: "/state/a1b2c3", status: "working", since: 1, turn: 1,
    message: "", last_text: "", created: 1, ...overrides,
  };
}

function pulled(event: PullRecord["event"], overrides: Partial<PullRecord> = {}): PullRecord {
  return {
    id: "a1b2c3", name: "api", event, turn: 2, text: "reply", message: "", target: "repo:api", pane: "%5",
    cwd: "/work/api", session_file: "", ts: 1, screen: "", exit_status: "", ...overrides,
  };
}

function ctxFor(session: string, hasUI = true) {
  const widgets: Array<[string, unknown]> = [];
  const notes: Array<[string, string]> = [];
  return {
    widgets,
    notes,
    ctx: {
      hasUI,
      cwd: "/work",
      sessionManager: { getSessionId: () => session },
      ui: {
        setWidget: (key: string, content: unknown) => { widgets.push([key, content]); },
        notify: (text: string, level: string) => { notes.push([text, level]); },
      },
    },
  };
}

/** A lead with a scripted CLI: each answer is the result for one command. */
function leadHarness(answers: Record<string, () => CliResult | Promise<CliResult>> = {}) {
  const handlers = new Map<string, Handler[]>();
  const tools = new Map<string, Tool>();
  const messages: Array<{ message: Record<string, unknown>; options: unknown }> = [];
  const calls: Call[] = [];
  const timers: Array<{ callback: () => void; ms: number; cleared: boolean }> = [];
  const clock = { now: 1_000_000 };
  const stats = new Map<string, string>();
  const pi = {
    on(name: string, handler: Handler) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
    registerTool(tool: Tool) { tools.set(tool.name, tool); },
    registerMessageRenderer() {},
    sendMessage(message: Record<string, unknown>, options: unknown) { messages.push({ message, options }); },
  };
  const lead = registerLeadMode(pi as unknown as ExtensionAPI, {
    stateRoot: "/state",
    run: async (args, options) => {
      calls.push(options === undefined ? { args } : { args, options });
      const answer = answers[args[0]];
      return answer ? answer() : { code: 0, stdout: args[0] === "list" ? "[]" : "", stderr: "" };
    },
    setTimeout: (callback, ms) => {
      timers.push({ callback, ms, cleared: false });
      return timers.at(-1) as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (timer) => { (timer as unknown as { cleared: boolean }).cleared = true; },
    now: () => clock.now,
    statKey: (path) => stats.get(path) ?? "-",
  });
  const emit = async (name: string, ctx: unknown, event: Record<string, unknown> = {}) => {
    const results: unknown[] = [];
    for (const handler of handlers.get(name) ?? []) results.push(await handler({ type: name, ...event }, ctx));
    return results;
  };
  const pending = () => timers.filter((timer) => !timer.cleared);
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return { lead, tools, messages, calls, timers, pending, clock, stats, emit, settle };
}

test("the argument arrays put the text after --, so a leading - or @ stays text", () => {
  assert.deepEqual(spawnArgs("lead-1", { prompt: "-rm everything" }), ["spawn", "--lead", "lead-1", "--", "-rm everything"]);
  assert.deepEqual(spawnArgs("lead-1", {
    prompt: "@file.md", cwd: "/w", name: "api", session: "repo", session_dir: "/r", window: "api-w",
    model: "anthropic/x:high", thinking: "low", pi_args: ["--tools", "read,bash"],
  }), [
    "spawn", "--lead", "lead-1", "--cwd", "/w", "--name", "api", "--session", "repo", "--session-dir", "/r",
    "--window", "api-w", "--model", "anthropic/x:high", "--thinking", "low",
    "--pi-arg", "--tools", "--pi-arg", "read,bash", "--", "@file.md",
  ]);
  assert.deepEqual(spawnArgs("lead-1", { prompt: "x", name: " ", model: "" }), ["spawn", "--lead", "lead-1", "--", "x"],
    "empty options are left out");
  assert.deepEqual(sendArgs("api", "--help"), ["send", "api", "--", "--help"]);
  assert.deepEqual(readArgs("api"), ["read", "api"]);
  assert.deepEqual(readArgs("api", 20), ["read", "api", "--lines", "20"]);
  assert.deepEqual(listArgs("lead-1"), ["list", "--json", "--lead", "lead-1"]);
  assert.deepEqual(trailerFields(`note\n${TRAILER}\n`), {
    id: "a1b2c3", target: "repo:api", pane: "%5", turn: "0", event: "spawn",
  });
});

test("the tools run the CLI with the lead session, and report a failure as an error", async () => {
  const calls: Call[] = [];
  const answers: Record<string, CliResult> = {
    spawn: { code: 0, stdout: "a1b2c3\n", stderr: `${TRAILER}\nThe window opened in a new session.\n` },
    send: { code: 0, stdout: "", stderr: "pi-tmux-agents: id=a1b2c3 target=repo:api\nreopened the agent on its pi session\n" },
    read: { code: 0, stdout: "screen line\n\n", stderr: "" },
    interrupt: { code: 0, stdout: "", stderr: "pi-tmux-agents: no turn runs\n" },
    stop: { code: 2, stdout: "", stderr: "pi-tmux-agents: no agent matches nope\n" },
    list: { code: 0, stdout: JSON.stringify([listed()]), stderr: "" },
  };
  const tools = new Map<string, Tool>();
  let refreshed = 0;
  registerTools({ registerTool: (tool: Tool) => { tools.set(tool.name, tool); } } as never, {
    run: async (args, options) => { calls.push({ args, options }); return answers[args[0]]; },
    refresh: () => { refreshed += 1; },
  });
  assert.deepEqual([...tools.keys()], [
    "TmuxAgentSpawn", "TmuxAgentSend", "TmuxAgentRead", "TmuxAgentInterrupt", "TmuxAgentStop", "TmuxAgentList",
  ]);
  const ctx = ctxFor("lead-1").ctx;
  const run = (name: string, params: Record<string, unknown>) => tools.get(name)!.execute("t", params, undefined, undefined, ctx);

  const spawn = await run("TmuxAgentSpawn", { prompt: "-task", name: "api" });
  assert.deepEqual(calls[0], {
    args: ["spawn", "--lead", "lead-1", "--name", "api", "--", "-task"],
    options: { signal: undefined, timeout: 30_000, cwd: "/work" },
  });
  assert.equal(spawn.content[0].text, [
    'Started pi tmux agent "api" id=a1b2c3 target=repo:api pane=%5.',
    "Its turn results arrive as follow-up messages. Do not poll.",
    "The window opened in a new session.",
  ].join("\n"));
  assert.deepEqual(spawn.details, { action: "spawn", id: "a1b2c3", name: "api", target: "repo:api", status: "started" });

  const send = await run("TmuxAgentSend", { agent: "api", message: "go" });
  assert.equal(send.details.status, "reopened");
  assert.match(send.content[0].text, /^Reopened agent api on its pi session in repo:api\./);
  answers.send = { code: 0, stdout: "", stderr: "pi-tmux-agents: id=a1b2c3 target=repo:api\nthe message is in the inbox\n" };
  assert.equal((await run("TmuxAgentSend", { agent: "api", message: "go" })).details.status, "queued");

  const read = await run("TmuxAgentRead", { agent: "api" });
  assert.equal(read.content[0].text, "screen line");
  const interrupt = await run("TmuxAgentInterrupt", { agent: "api" });
  assert.equal(interrupt.details.status, "no_turn");

  const stop = await run("TmuxAgentStop", { agent: "nope" });
  assert.equal(stop.isError, true);
  assert.equal(stop.details.error, "pi-tmux-agents: no agent matches nope");
  assert.equal(stop.content[0].text, "pi-tmux-agents: no agent matches nope");

  const list = await run("TmuxAgentList", {});
  assert.deepEqual(calls.at(-1)?.args, ["list", "--json", "--lead", "lead-1"]);
  assert.equal(list.content[0].text, "a1b2c3\tapi\tworking\trepo:api\t/work/api");
  assert.equal(refreshed, 5, "every tool but read and list refreshes the panel");
});

test("a lead delivers each pulled record as one follow-up that starts a turn, and warns on waiting", async () => {
  const records = [pulled("stop"), pulled("waiting", { id: "b", name: "web", message: "confirm dialog: Go?" })];
  const h = leadHarness({
    pull: () => ({ code: 0, stdout: records.map((record) => JSON.stringify(record)).join("\n"), stderr: "" }),
    list: () => ({ code: 0, stdout: JSON.stringify([listed()]), stderr: "" }),
  });
  const { ctx, notes, widgets } = ctxFor("lead-1");
  await h.emit("session_start", ctx, { reason: "startup" });
  await h.settle();
  assert.deepEqual(h.calls.map((call) => call.args), [
    ["pull", "--lead", "lead-1", "--json"], ["list", "--json", "--lead", "lead-1"],
  ]);
  assert.equal(h.messages.length, 2);
  for (const [index, { message, options }] of h.messages.entries()) {
    assert.deepEqual(options, { triggerTurn: true, deliverAs: "followUp" });
    assert.equal(message.customType, RESULT_TYPE);
    assert.equal(message.display, true);
    assert.deepEqual(message.details, records[index]);
  }
  assert.match(String(h.messages[0].message.content), /ended turn 2/);
  assert.deepEqual(notes, [["tmux agent web needs input: confirm dialog: Go?", "warning"]]);
  assert.equal(widgets.length, 1);
  assert.equal(widgets[0][0], WIDGET_KEY);
  assert.equal(typeof widgets[0][1], "function");
  assert.deepEqual(h.pending().map((timer) => timer.ms), [1_000], "a live agent polls every second");
});

test("a lead skips the CLI while nothing changed, and polls at least every 10 seconds", async () => {
  const h = leadHarness({ list: () => ({ code: 0, stdout: JSON.stringify([listed()]), stderr: "" }) });
  await h.emit("session_start", ctxFor("lead-1").ctx, { reason: "startup" });
  await h.settle();
  assert.equal(h.calls.length, 2);
  await h.lead.poll();
  assert.equal(h.calls.length, 2, "the files did not change");
  h.stats.set("/state/a1b2c3/turns.jsonl", "2:100");
  await h.lead.poll();
  assert.equal(h.calls.length, 4, "a new turn line starts a full poll");
  h.clock.now += 9_999;
  await h.lead.poll();
  assert.equal(h.calls.length, 4);
  h.clock.now += 1;
  await h.lead.poll();
  assert.equal(h.calls.length, 6, "a pane that dies changes no file");
  await h.lead.poll(true);
  assert.equal(h.calls.length, 8, "a forced poll ignores the change check");
});

test("a lead polls every 10 seconds without a live agent, and hides the panel when all agents stop", async () => {
  let agents = [listed()];
  const h = leadHarness({ list: () => ({ code: 0, stdout: JSON.stringify(agents), stderr: "" }) });
  const { ctx, widgets } = ctxFor("lead-1");
  await h.emit("session_start", ctx, { reason: "startup" });
  await h.settle();
  assert.equal(widgets.length, 1);
  agents = [listed({ status: "dead" }), listed({ id: "b", status: "stopped" })];
  await h.lead.poll(true);
  assert.equal(hasLiveAgent(h.lead.agents()), false);
  assert.deepEqual(h.pending().map((timer) => timer.ms), [10_000]);
  assert.equal(widgets.length, 1, "a dead agent stays in the panel");
  agents = [listed({ status: "stopped" })];
  await h.lead.poll(true);
  assert.deepEqual(widgets.at(-1), [WIDGET_KEY, undefined]);
  h.pending()[0].callback();
  await h.settle();
  assert.equal(h.calls.at(-2)?.args[0], "pull", "the timer runs the next poll");
});

test("a tool refresh polls at once, and a running poll runs again when it ends", async () => {
  let release: (() => void) | undefined;
  const h = leadHarness({
    pull: () => new Promise((resolve) => { release = () => resolve({ code: 0, stdout: "", stderr: "" }); }),
  });
  await h.emit("session_start", ctxFor("lead-1").ctx, { reason: "startup" });
  await h.tools.get("TmuxAgentStop")!.execute("t", { agent: "api" }, undefined, undefined, ctxFor("lead-1").ctx);
  release?.();
  await h.settle();
  assert.deepEqual(h.pending().map((timer) => timer.ms), [0]);
});

test("a lead registers its skill folder, and reads the agents of the active session only", async () => {
  let release: (() => void) | undefined;
  const h = leadHarness({
    pull: () => new Promise((resolve) => {
      release = () => resolve({ code: 0, stdout: JSON.stringify(pulled("stop")), stderr: "" });
    }),
  });
  const [discovered] = await h.emit("resources_discover", {}, { reason: "startup" }) as Array<{ skillPaths: string[] }>;
  assert.equal(discovered.skillPaths.length, 1);
  assert.match(discovered.skillPaths[0], /\/pi-tmux-agents\/skills$/);

  const first = ctxFor("lead-1");
  await h.emit("session_start", first.ctx, { reason: "startup" });
  const stale = release;
  const second = ctxFor("lead-2");
  await h.emit("session_start", second.ctx, { reason: "new" });
  stale?.();
  await h.settle();
  assert.equal(h.messages.length, 0, "the pull of the old session must not deliver into the new one");
  release?.();
  await h.settle();
  assert.deepEqual(h.calls.filter((call) => call.args[0] === "pull").map((call) => call.args[2]), ["lead-1", "lead-2"]);
  assert.equal(h.messages.length, 1);

  await h.emit("session_shutdown", second.ctx, { reason: "quit" });
  assert.equal(h.pending().length, 0, "shutdown stops the timer");
});

test("a lead without a UI does not poll, as no result could start a turn", async () => {
  const h = leadHarness();
  await h.emit("session_start", ctxFor("lead-1", false).ctx, { reason: "startup" });
  await h.settle();
  assert.deepEqual(h.calls, []);
  assert.deepEqual(h.pending(), []);
});
