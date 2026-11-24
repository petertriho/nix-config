import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  appendTurn, extractAssistantText, listInbox, registerAgentMode, settledEvent,
  type TurnLine,
} from "../agent.ts";
import { pickMode } from "../index.ts";

type Handler = (event: Record<string, unknown>, ctx: unknown) => unknown;

const turnSignal = fileURLToPath(new URL(
  "../../../../../../claude/.claude/skills/tmux-worker/scripts/turn-signal.sh",
  import.meta.url,
));

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-tmux-agents-agent-"));
  mkdirSync(join(dir, "inbox"));
  return dir;
}

function readTurns(dir: string): TurnLine[] {
  return readFileSync(join(dir, "turns.jsonl"), "utf8").split("\n").filter(Boolean)
    .map((line) => JSON.parse(line) as TurnLine);
}

function harness(dir: string) {
  const handlers = new Map<string, Handler[]>();
  const sent: Array<{ text: string; options?: unknown }> = [];
  const state = { idle: true, aborts: 0 };
  const timers: Array<{ callback: () => void; ms: number }> = [];
  let cleared = 0;
  const pi = {
    on(name: string, handler: Handler) {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    },
    sendUserMessage(text: string, options?: unknown) {
      sent.push(options === undefined ? { text } : { text, options });
    },
  };
  const ctx = {
    isIdle: () => state.idle,
    abort: () => { state.aborts += 1; },
    sessionManager: {
      getSessionId: () => "session-1",
      getSessionFile: () => "/sessions/session-1.jsonl",
    },
  };
  const mode = registerAgentMode(pi as unknown as ExtensionAPI, {
    dir,
    now: () => 1_700_000_000_000,
    setInterval: (callback, ms) => {
      timers.push({ callback, ms });
      return timers.length as unknown as ReturnType<typeof setInterval>;
    },
    clearInterval: () => { cleared += 1; },
  });
  const emit = async (name: string, event: Record<string, unknown> = {}) => {
    for (const handler of handlers.get(name) ?? []) await handler({ type: name, ...event }, ctx);
  };
  return { mode, sent, state, timers, emit, cleared: () => cleared };
}

function inbox(dir: string, name: string, text = ""): void {
  writeFileSync(join(dir, "inbox", name), text);
}

test("pickMode picks agent, lead, or no mode from the marker variables", () => {
  assert.equal(pickMode({ PI_TMUX_AGENT_ID: "a1", PI_TMUX_AGENT_DIR: "/state/a1" }), "agent");
  assert.equal(pickMode({}), "lead");
  assert.equal(pickMode({ PI_TMUX_AGENT_ID: "a1" }), "none", "an agent without its folder cannot work");
  for (const marker of ["TMUX_WORKER_ID", "PI_SUBAGENT_ID", "PI_SUBAGENT_SESSION"]) {
    assert.equal(pickMode({ [marker]: "x" }), "none", marker);
  }
  assert.equal(pickMode({ PI_TMUX_AGENT_ID: "", PI_SUBAGENT_ID: "" }), "lead", "empty markers do not count");
});

test("a turn line has the keys, order, and types of turn-signal.sh", () => {
  const dir = tempDir();
  try {
    const shell = spawnSync("bash", [turnSignal, "stop"], {
      input: JSON.stringify({ last_assistant_message: "hi", session_id: "s1" }),
      env: { ...process.env, TMUX_WORKER_DIR: dir },
    });
    assert.equal(shell.status, 0);
    const reference = readTurns(dir)[0];
    rmSync(join(dir, "turns.jsonl"));
    const line = appendTurn(dir, { event: "stop", text: "hi", message: "", session_id: "s1" }, 1_700_000_000_999);
    assert.deepEqual(Object.keys(line), Object.keys(reference));
    assert.deepEqual(Object.keys(readTurns(dir)[0]), Object.keys(reference));
    for (const key of Object.keys(reference) as Array<keyof TurnLine>) {
      assert.equal(typeof line[key], typeof reference[key], key);
    }
    assert.equal(line.seq, 1);
    assert.equal(line.ts, 1_700_000_000);
    assert.equal(appendTurn(dir, { event: "working", text: "", message: "", session_id: "s1" }).seq, 2);
    assert.deepEqual(readdirSync(dir).filter((name) => name.startsWith(".")), [], "the lock is released");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("extractAssistantText and settledEvent map a settled run to one event", () => {
  const result = extractAssistantText([
    { role: "user", content: "x" },
    { role: "assistant", content: [{ type: "text", text: "a" }, { type: "toolCall" }, { type: "text", text: "b" }], stopReason: "stop" },
  ]);
  assert.deepEqual(result, { text: "a\nb", stopReason: "stop" });
  assert.deepEqual(settledEvent(false, result), { event: "stop", text: "a\nb", message: "" });
  assert.deepEqual(
    settledEvent(false, { text: "partial", stopReason: "error", errorMessage: "529 overloaded" }),
    { event: "error", text: "partial", message: "error: 529 overloaded" },
  );
  assert.deepEqual(settledEvent(false, { text: "", stopReason: "length" }), { event: "error", text: "", message: "length" });
  assert.equal(settledEvent(true, result).event, "interrupted");
  assert.equal(settledEvent(false, { text: "", stopReason: "aborted" }).event, "interrupted",
    "pi 1.6 marks an abort only in the stop reason");
  assert.equal(settledEvent(false, undefined).event, "error");
});

test("agent mode writes working only on a change, and waiting while a run waits on a dialog", async () => {
  const dir = tempDir();
  try {
    const { emit, state } = harness(dir);
    await emit("session_start", { reason: "startup" });
    assert.deepEqual(JSON.parse(readFileSync(join(dir, "session.json"), "utf8")), {
      session_id: "session-1", session_file: "/sessions/session-1.jsonl",
    });
    await emit("input", { text: "go", source: "extension" });
    state.idle = false;
    await emit("agent_start");
    await emit("input", { text: "more", source: "extension", streamingBehavior: "followUp" });
    await emit("ui_prompt_start", { kind: "select", title: "Pick one" });
    await emit("input", { text: "typed", source: "interactive" });
    await emit("ui_prompt_end", { kind: "select" });
    await emit("agent_end", { messages: [{ role: "assistant", content: [{ type: "text", text: "draft" }], stopReason: "stop" }] });
    await emit("agent_end", { messages: [{ role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" }] });
    state.idle = true;
    await emit("agent_settled");
    // A dialog outside a run is the user's own command.
    await emit("ui_prompt_start", { kind: "confirm", title: "Quit?" });
    await emit("ui_prompt_end", { kind: "confirm" });
    assert.deepEqual(readTurns(dir).map((line) => [line.seq, line.event, line.text, line.message, line.session_id]), [
      [1, "working", "", "", "session-1"],
      [2, "waiting", "", "select dialog: Pick one", "session-1"],
      [3, "working", "", "", "session-1"],
      [4, "stop", "done", "", "session-1"],
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("agent mode writes error with the stop reason, and interrupted for an abort", async () => {
  const dir = tempDir();
  try {
    const { emit, state } = harness(dir);
    await emit("session_start", { reason: "startup" });
    state.idle = false;
    await emit("agent_start");
    await emit("agent_end", {
      messages: [{ role: "assistant", content: [], stopReason: "error", errorMessage: "rate limited" }],
    });
    state.idle = true;
    await emit("agent_settled");
    state.idle = false;
    await emit("agent_start");
    await emit("agent_end", { messages: [{ role: "assistant", content: [], stopReason: "aborted" }] });
    state.idle = true;
    await emit("agent_settled", { aborted: true });
    assert.deepEqual(readTurns(dir).map((line) => [line.event, line.message]), [
      ["working", ""], ["error", "error: rate limited"], ["working", ""], ["interrupted", ""],
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a resumed agent reads its last event, so working is not written twice", async () => {
  const dir = tempDir();
  try {
    appendTurn(dir, { event: "working", text: "", message: "", session_id: "old" });
    const { emit } = harness(dir);
    await emit("session_start", { reason: "startup" });
    await emit("agent_start");
    assert.equal(readTurns(dir).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the inbox is handled in name order, on the first tick, as follow-ups while busy", async () => {
  const dir = tempDir();
  try {
    const { mode, emit, sent, state, timers, cleared } = harness(dir);
    inbox(dir, "00000000000000000002-message.txt", "second");
    inbox(dir, "00000000000000000001-message.txt", "-first @prompt");
    inbox(dir, ".tmp.abc", "partial");
    assert.deepEqual(listInbox(dir).map((entry) => entry.kind), ["message", "message"]);
    await emit("session_start", { reason: "startup" });
    assert.equal(timers.length, 1);
    assert.equal(timers[0].ms, 500);
    assert.deepEqual(sent, [], "the first prompt waits for the first tick");
    mode.tick();
    assert.deepEqual(sent, [{ text: "-first @prompt" }, { text: "second" }]);
    assert.deepEqual(readdirSync(join(dir, "inbox")), [".tmp.abc"]);
    state.idle = false;
    inbox(dir, "00000000000000000003-message.txt", "while busy");
    mode.tick();
    assert.deepEqual(sent.at(-1), { text: "while busy", options: { deliverAs: "followUp" } });
    await emit("session_shutdown");
    assert.equal(cleared(), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an abort stops a busy run, and later messages wait until the run settles", async () => {
  const dir = tempDir();
  try {
    const { mode, emit, sent, state } = harness(dir);
    await emit("session_start", { reason: "startup" });
    inbox(dir, "00000000000000000001-abort");
    mode.tick();
    assert.equal(state.aborts, 0, "an abort without a run does nothing");
    assert.deepEqual(readdirSync(join(dir, "inbox")), []);
    state.idle = false;
    inbox(dir, "00000000000000000002-abort");
    inbox(dir, "00000000000000000003-message.txt", "next");
    mode.tick();
    assert.equal(state.aborts, 1);
    assert.deepEqual(sent, []);
    mode.tick();
    assert.deepEqual(sent, [], "the run did not settle yet");
    state.idle = true;
    mode.tick();
    assert.deepEqual(sent, [{ text: "next" }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a message waits while a dialog is open, and an abort still goes through", async () => {
  const dir = tempDir();
  try {
    const { mode, emit, sent, state } = harness(dir);
    await emit("session_start", { reason: "startup" });
    state.idle = false;
    await emit("ui_prompt_start", { kind: "confirm", title: "Continue?" });
    inbox(dir, "00000000000000000001-message.txt", "held");
    mode.tick();
    assert.deepEqual(sent, []);
    assert.equal(readdirSync(join(dir, "inbox")).length, 1);
    await emit("ui_prompt_end", { kind: "confirm" });
    mode.tick();
    assert.deepEqual(sent, [{ text: "held", options: { deliverAs: "followUp" } }]);
    await emit("ui_prompt_start", { kind: "confirm" });
    inbox(dir, "00000000000000000002-abort");
    mode.tick();
    assert.equal(state.aborts, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
