import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { discoverAgentTypes, findAgentType, type AgentType } from "../agent-types.ts";
import type { CliOptions, CliResult, ListedAgent, PullRecord } from "../cli.ts";
import { hasLiveAgent, registerLeadMode } from "../lead.ts";
import { RESULT_TYPE } from "../presentation/renderers.ts";
import { WIDGET_KEY } from "../presentation/widget.ts";
import {
  agentSpawnArgs, listArgs, pullArgs, readArgs, registerTools, resolveAgentRef, sendArgs, slugify,
  trailerFields, uniqueName, type ToolRuntime,
} from "../tools.ts";

type Handler = (event: Record<string, unknown>, ctx: unknown) => unknown;
type Call = { args: string[]; options?: CliOptions };
type Tool = {
  name: string;
  description: string;
  execute: (id: string, params: Record<string, unknown>, signal: AbortSignal | undefined, onUpdate: unknown, ctx: unknown) =>
    Promise<{ content: Array<{ text: string }>; details: Record<string, unknown>; isError?: boolean }>;
};

const TRAILER = "pi-tmux-agents: id=a1b2c3 target=repo:api pane=%5 turn=0 event=spawn";

function listed(overrides: Partial<ListedAgent> = {}): ListedAgent {
  return {
    id: "a1b2c3", name: "api", lead_session: "lead-1", session: "repo", window: "api", pane: "%5",
    target: "repo:api", cwd: "/work/api", dir: "/state/a1b2c3", status: "working", since: 1, turn: 1,
    message: "", last_text: "", agent_type: "", description: "", auto_stop: false, worktree: "", branch: "",
    created: 1, ...overrides,
  };
}

function pulled(event: PullRecord["event"], overrides: Partial<PullRecord> = {}): PullRecord {
  return {
    id: "a1b2c3", name: "api", event, turn: 2, text: "reply", message: "", target: "repo:api", pane: "%5",
    cwd: "/work/api", session_file: "", ts: 1, screen: "", exit_status: "", agent_type: "", auto_stopped: false,
    ...overrides,
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
      isProjectTrusted: () => true,
      sessionManager: { getSessionId: () => session },
      ui: {
        setWidget: (key: string, content: unknown) => { widgets.push([key, content]); },
        notify: (text: string, level: string) => { notes.push([text, level]); },
      },
    },
  };
}

/** A lead with a scripted CLI: each answer is the result for one command. */
function leadHarness(
  answers: Record<string, (args: string[], options?: CliOptions) => CliResult | Promise<CliResult>> = {},
  discoverTypes?: (options: { cwd?: string; trusted?: boolean }) => AgentType[],
) {
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
      return answer ? answer(args, options) : { code: 0, stdout: args[0] === "list" ? "[]" : "", stderr: "" };
    },
    setTimeout: (callback, ms) => {
      timers.push({ callback, ms, cleared: false });
      return timers.at(-1) as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout: (timer) => { (timer as unknown as { cleared: boolean }).cleared = true; },
    now: () => clock.now,
    statKey: (path) => stats.get(path) ?? "-",
    ...(discoverTypes ? { discoverTypes } : {}),
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

const TYPES = discoverAgentTypes();
const EXPLORE = findAgentType(TYPES, "Explore")!;
const GENERAL = findAgentType(TYPES, "general-purpose")!;

test("the argument arrays put the text after --, so a leading - or @ stays text", () => {
  assert.deepEqual(agentSpawnArgs("lead-1", { description: "find  x", prompt: "-rm everything" }, GENERAL, "find-x"), [
    "spawn", "--lead", "lead-1", "--name", "find-x", "--agent-type", "general-purpose", "--description", "find x",
    "--window", "find-x", "--", "-rm everything",
  ]);
  assert.deepEqual(agentSpawnArgs("lead-1", {
    description: "d", prompt: "@file.md", cwd: "/w", session: "repo", session_dir: "/r", window: "api-w",
    model: "anthropic/x:high", thinking: "low", isolation: "worktree", worktree_path: "/r/wt", branch: "b",
    base: "origin/main",
  }, EXPLORE, "api", "/tmp/p.md"), [
    "spawn", "--lead", "lead-1", "--name", "api", "--agent-type", "Explore", "--description", "d",
    "--cwd", "/w", "--session", "repo", "--session-dir", "/r", "--window", "api-w",
    "--model", "anthropic/x:high", "--thinking", "low", "--tools", "read,grep,find,ls", "--auto-stop",
    "--system-prompt-file", "/tmp/p.md", "--isolation", "worktree", "--worktree-path", "/r/wt", "--branch", "b",
    "--base", "origin/main", "--", "@file.md",
  ]);
  const typed = { ...GENERAL, model: "type/model", thinking: "high" };
  assert.deepEqual(agentSpawnArgs("lead-1", { description: "d", prompt: "x", model: "", worktree_path: "/ignored" }, typed, "n"), [
    "spawn", "--lead", "lead-1", "--name", "n", "--agent-type", "general-purpose", "--description", "d",
    "--window", "n", "--model", "type/model", "--thinking", "high", "--", "x",
  ], "the type gives the model; worktree options need isolation");
  assert.deepEqual(sendArgs("api", "--help"), ["send", "api", "--", "--help"]);
  assert.deepEqual(readArgs("api"), ["read", "api"]);
  assert.deepEqual(readArgs("api", 20), ["read", "api", "--lines", "20"]);
  assert.deepEqual(listArgs("lead-1"), ["list", "--json", "--lead", "lead-1"]);
  assert.deepEqual(pullArgs("lead-1"), ["pull", "--lead", "lead-1", "--json"]);
  assert.deepEqual(pullArgs("lead-1", new Set(["a", "b"])), ["pull", "--lead", "lead-1", "--json", "--skip", "a", "--skip", "b"]);
  assert.deepEqual(trailerFields(`note\n${TRAILER}\n`), {
    id: "a1b2c3", target: "repo:api", pane: "%5", turn: "0", event: "spawn",
  });
});

test("default names are slugs of the description, unique in the session, and names resolve to ids", () => {
  assert.equal(slugify("Find the  Parser!"), "find-the-parser");
  assert.equal(slugify("--x..y--"), "x.y");
  assert.equal(slugify("???"), "agent");
  assert.equal(uniqueName("api", []), "api");
  assert.equal(uniqueName("api", ["api", "api-2"]), "api-3");
  const agents = [listed(), listed({ id: "d4e5f6", name: "web" }), listed({ id: "x1", name: "dup" }), listed({ id: "x2", name: "dup" })];
  assert.equal(resolveAgentRef("web", agents), "d4e5f6");
  assert.equal(resolveAgentRef(" a1b2c3 ", agents), "a1b2c3");
  assert.equal(resolveAgentRef("dup", agents), "dup", "an ambiguous name goes to the CLI");
  assert.equal(resolveAgentRef("other", agents), "other");
});

function toolRuntime(answers: Record<string, (args: string[], options?: CliOptions) => CliResult | Promise<CliResult>>) {
  const calls: Call[] = [];
  const tools = new Map<string, Tool>();
  let refreshed = 0;
  let agents: ListedAgent[] = [];
  const runtime: ToolRuntime = {
    run: async (args, options) => {
      calls.push({ args, options });
      const answer = answers[args[0]];
      return answer ? answer(args, options) : { code: 0, stdout: "", stderr: "" };
    },
    refresh: () => { refreshed += 1; },
    agents: () => agents,
    agentTypes: () => TYPES,
    foreground: new Set<string>(),
  };
  registerTools({ registerTool: (tool: Tool) => { tools.set(tool.name, tool); } } as never, runtime);
  const ctx = ctxFor("lead-1").ctx;
  const run = (name: string, params: Record<string, unknown>, signal?: AbortSignal) =>
    tools.get(name)!.execute("t", params, signal, undefined, ctx);
  return {
    calls, tools, runtime, run,
    refreshed: () => refreshed,
    setAgents: (next: ListedAgent[]) => { agents = next; },
  };
}

const SPAWNED: CliResult = { code: 0, stdout: "a1b2c3\n", stderr: `${TRAILER}\nThe window opened in a new session.\n` };

test("the lead registers the six Agent tools and no TmuxAgent tool", () => {
  const h = toolRuntime({});
  assert.deepEqual([...h.tools.keys()], ["Agent", "SendMessage", "ListAgents", "AgentRead", "AgentInterrupt", "AgentStop"]);
  const description = h.tools.get("Agent")!.description;
  assert.match(description, /run_in_background: true/);
  assert.match(description, /- Explore: .*tools: read, grep, find, ls/);
  assert.match(description, /- general-purpose: /);
});

test("a background Agent call returns at once with the id, and passes the type prompt in a file", async () => {
  let promptText = "";
  let promptPath = "";
  const h = toolRuntime({
    spawn: (args) => {
      promptPath = args[args.indexOf("--system-prompt-file") + 1];
      promptText = readFileSync(promptPath, "utf8");
      return SPAWNED;
    },
  });
  h.setAgents([listed({ name: "find-the-parser" })]);
  const result = await h.run("Agent", {
    description: "Find the parser", prompt: "-task", subagent_type: "explore", run_in_background: true,
  });
  assert.equal(h.calls.length, 1, "a background call does not wait");
  const args = h.calls[0].args;
  assert.deepEqual(args.slice(0, 8), [
    "spawn", "--lead", "lead-1", "--name", "find-the-parser-2", "--agent-type", "Explore", "--description",
  ]);
  assert.deepEqual(args.slice(-2), ["--", "-task"]);
  assert.deepEqual(h.calls[0].options, { signal: undefined, timeout: 30_000, cwd: "/work" });
  assert.equal(promptText, `${EXPLORE.prompt}\n`);
  assert.equal(existsSync(promptPath), false, "the temporary prompt file is removed");
  assert.equal(result.content[0].text, [
    'Started agent "find-the-parser-2" (Explore) id=a1b2c3 target=repo:api in the background.',
    "Its result arrives as a follow-up message. Do not poll.",
    "The window opened in a new session.",
  ].join("\n"));
  assert.deepEqual(result.details, {
    action: "agent", id: "a1b2c3", name: "find-the-parser-2", agentType: "Explore", description: "Find the parser",
    target: "repo:api", background: true, status: "started",
  });
  assert.equal(h.runtime.foreground.size, 0);
  assert.equal(h.refreshed(), 1);
});

test("Agent rejects an unknown type and another isolation, and reports a failed spawn", async () => {
  const h = toolRuntime({ spawn: () => ({ code: 64, stdout: "", stderr: "pi-tmux-agents: bad base\n" }) });
  const unknown = await h.run("Agent", { description: "d", prompt: "p", subagent_type: "nope" });
  assert.equal(unknown.isError, true);
  assert.match(unknown.content[0].text, /^Unknown subagent_type "nope"\. The agent types are: Explore, general-purpose, Plan\.$/);
  const isolation = await h.run("Agent", { description: "d", prompt: "p", isolation: "remote" });
  assert.equal(isolation.isError, true);
  assert.equal(h.calls.length, 0);
  const failed = await h.run("Agent", { description: "d", prompt: "p", isolation: "worktree", base: "origin/x" });
  assert.equal(failed.isError, true);
  assert.equal(failed.content[0].text, "pi-tmux-agents: bad base");
  assert.equal(h.calls[0].options?.timeout, 300_000, "a worktree spawn can fetch first");
});

test("a foreground Agent call waits, and maps the exit code of wait to the result", async () => {
  const STOP = "pi-tmux-agents: id=a1b2c3 target=repo:api pane=%5 turn=1 event=stop\n";
  const cases: Array<[CliResult, { status: string; isError: boolean; text: RegExp }]> = [
    [{ code: 0, stdout: "All done.\n", stderr: STOP }, {
      status: "completed", isError: false, text: /^All done\.\n\nAgent "d" \(id a1b2c3, repo:api\) ended its turn\. Continue it with SendMessage\.\npi-tmux-agents: id=a1b2c3 .*event=stop\n/,
    }],
    [{ code: 0, stdout: "Found.\n", stderr: `${STOP}pi-tmux-agents: id=a1b2c3 auto-stopped; send a message to resume it\n` }, {
      status: "completed", isError: false, text: /Its window closed \(auto-stop\)\./,
    }],
    [{ code: 3, stdout: "Go?\n→ Yes\n", stderr: "pi-tmux-agents: id=a1b2c3 target=repo:api pane=%5 turn=1 event=waiting\n" }, {
      status: "waiting", isError: false, text: /waits on a dialog\. Only the user can answer it, in the window repo:api\.\nIts later results arrive as follow-up messages\. AgentInterrupt cancels the dialog\.\n\nGo\?\n→ Yes/,
    }],
    [{ code: 1, stdout: "partial\n", stderr: "pi-tmux-agents: id=a1b2c3 target=repo:api pane=%5 turn=1 event=interrupted\n" }, {
      status: "interrupted", isError: true, text: /ended its turn with an interrupt\.\n\npartial/,
    }],
    [{ code: 1, stdout: "", stderr: "pi-tmux-agents: id=a1b2c3 target=repo:api pane=%5 turn=1 event=error error=rate\n" }, {
      status: "failed", isError: true, text: /ended its turn with an error\./,
    }],
    [{ code: 2, stdout: "", stderr: "pi-tmux-agents: id=a1b2c3 pi exited with status 1\n" }, {
      status: "failed", isError: true, text: /is gone or stopped\./,
    }],
  ];
  for (const [waited, expected] of cases) {
    let seen: Set<string> | undefined;
    const h = toolRuntime({
      spawn: () => SPAWNED,
      wait: () => { seen = new Set(h.runtime.foreground); return waited; },
    });
    const result = await h.run("Agent", { description: "d", prompt: "p" });
    assert.deepEqual(h.calls.map((call) => call.args[0]), ["spawn", "wait"], expected.status);
    assert.deepEqual(h.calls[1].args, ["wait", "a1b2c3"]);
    assert.equal(h.calls[1].options?.timeout, undefined, "a foreground wait has no timeout");
    assert.deepEqual([...(seen ?? [])], ["a1b2c3"], "the lead poll skips the agent while the call waits");
    assert.equal(h.runtime.foreground.size, 0);
    assert.equal(result.details.status, expected.status);
    assert.equal(result.isError === true, expected.isError, expected.status);
    assert.match(result.content[0].text, expected.text);
    assert.match(result.content[0].text, /\nThe window opened in a new session\.$/, "the spawn notes follow the result");
  }
});

test("Esc during a foreground Agent call interrupts the agent and takes its interrupted event", async () => {
  const controller = new AbortController();
  const h = toolRuntime({
    spawn: () => SPAWNED,
    wait: (args, options) => {
      if (args.includes("--timeout")) return { code: 1, stdout: "", stderr: "event=interrupted\n" };
      return new Promise((resolve) => {
        options?.signal?.addEventListener("abort", () => resolve({ code: 143, stdout: "", stderr: "" }));
        controller.abort();
      });
    },
  });
  const result = await h.run("Agent", { description: "d", prompt: "p" }, controller.signal);
  assert.deepEqual(h.calls.map((call) => call.args), [
    h.calls[0].args, ["wait", "a1b2c3"], ["interrupt", "a1b2c3"], ["wait", "a1b2c3", "--timeout", "10"],
  ]);
  assert.equal(h.calls[2].options?.signal, undefined, "the interrupt must not use the aborted signal");
  assert.equal(result.details.status, "interrupted");
  assert.match(result.content[0].text, /^Interrupted agent "d" \(id a1b2c3\)\. Continue it with SendMessage\.$/);
  assert.equal(h.runtime.foreground.size, 0);
});

test("the other tools run the CLI with the lead session, resolve names, and report a failure as an error", async () => {
  const answers: Record<string, () => CliResult> = {
    send: () => ({ code: 0, stdout: "", stderr: "pi-tmux-agents: id=a1b2c3 target=repo:api pane=%5 reopened the agent on its pi session\n" }),
    read: () => ({ code: 0, stdout: "screen line\n\n", stderr: "" }),
    interrupt: () => ({ code: 0, stdout: "", stderr: "pi-tmux-agents: id=a1b2c3 no turn runs; nothing to interrupt\n" }),
    stop: () => ({ code: 2, stdout: "", stderr: "pi-tmux-agents: no agent matches nope\n" }),
    list: () => ({ code: 0, stdout: JSON.stringify([listed({ agent_type: "Explore", description: "find x" })]), stderr: "" }),
  };
  const h = toolRuntime(answers);
  h.setAgents([listed()]);

  const send = await h.run("SendMessage", { to: "api", message: "go" });
  assert.deepEqual(h.calls[0].args, ["send", "a1b2c3", "--", "go"]);
  assert.equal(send.details.status, "reopened");
  assert.match(send.content[0].text, /^Reopened agent api on its pi session in repo:api\./);
  answers.send = () => ({ code: 0, stdout: "", stderr: "pi-tmux-agents: id=a1b2c3 target=repo:api the message is in the inbox\n" });
  assert.equal((await h.run("SendMessage", { to: "api", message: "go" })).details.status, "queued");

  const read = await h.run("AgentRead", { agent: "api", lines: 20 });
  assert.deepEqual(h.calls.at(-1)?.args, ["read", "a1b2c3", "--lines", "20"]);
  assert.equal(read.content[0].text, "screen line");
  const interrupt = await h.run("AgentInterrupt", { agent: "api" });
  assert.equal(interrupt.details.status, "no_turn");

  const stop = await h.run("AgentStop", { agent: "nope" });
  assert.deepEqual(h.calls.at(-1)?.args, ["stop", "nope"]);
  assert.equal(stop.isError, true);
  assert.equal(stop.details.error, "pi-tmux-agents: no agent matches nope");
  assert.equal(stop.content[0].text, "pi-tmux-agents: no agent matches nope");

  const list = await h.run("ListAgents", {});
  assert.deepEqual(h.calls.at(-1)?.args, ["list", "--json", "--lead", "lead-1"]);
  assert.equal(list.content[0].text, "a1b2c3\tapi\tExplore\tworking\trepo:api\t/work/api\tfind x");
  assert.equal(h.refreshed(), 4, "every tool but read and list refreshes the panel");
});

test("the lead poll skips the agent of a running foreground Agent call", async () => {
  let release: (() => void) | undefined;
  const h = leadHarness({
    spawn: () => SPAWNED,
    wait: () => new Promise((resolve) => { release = () => resolve({ code: 0, stdout: "done\n", stderr: "" }); }),
  });
  const { ctx } = ctxFor("lead-1");
  await h.emit("session_start", ctx, { reason: "startup" });
  await h.settle();
  const call = h.tools.get("Agent")!.execute("t", { description: "d", prompt: "p" }, undefined, undefined, ctx);
  await h.settle();
  assert.deepEqual([...h.lead.foreground], ["a1b2c3"]);
  await h.lead.poll(true);
  const pulls = () => h.calls.filter((entry) => entry.args[0] === "pull").map((entry) => entry.args);
  assert.deepEqual(pulls().at(-1), ["pull", "--lead", "lead-1", "--json", "--skip", "a1b2c3"]);
  release?.();
  assert.equal((await call).details.status, "completed");
  await h.lead.poll(true);
  assert.deepEqual(pulls().at(-1), ["pull", "--lead", "lead-1", "--json"]);
});

test("session_start registers Agent again when the project has its own types", async () => {
  const review: AgentType = {
    name: "review", description: "Reviews the diff.", autoStop: true, prompt: "Review.", source: "project",
    path: "/work/.pi/agents/review.md",
  };
  const seen: Array<{ cwd?: string; trusted?: boolean }> = [];
  const h = leadHarness({}, (options) => {
    seen.push(options);
    return options.trusted ? [...TYPES, review] : TYPES;
  });
  assert.doesNotMatch(h.tools.get("Agent")!.description, /- review:/);
  await h.emit("session_start", ctxFor("lead-1").ctx, { reason: "startup" });
  assert.deepEqual(seen.at(-1), { cwd: "/work", trusted: true });
  assert.match(h.tools.get("Agent")!.description, /- review: Reviews the diff\. \(the window closes after the result; project\)/);
  assert.deepEqual(h.lead.agentTypes().map((type) => type.name).at(-1), "review");
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
  await h.tools.get("AgentStop")!.execute("t", { agent: "api" }, undefined, undefined, ctxFor("lead-1").ctx);
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
