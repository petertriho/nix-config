import {
  appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync,
  unlinkSync, writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/** Events in turns.jsonl. The agent writes all but the CLI pseudo event gone. */
export type TurnEvent = "working" | "waiting" | "stop" | "error" | "interrupted";

/** One line of turns.jsonl, with the keys in the order of turn-signal.sh. */
export interface TurnLine {
  seq: number;
  event: TurnEvent;
  text: string;
  message: string;
  session_id: string;
  ts: number;
}

export interface TurnResult {
  text: string;
  stopReason: string;
  errorMessage?: string;
}

export interface InboxEntry {
  name: string;
  kind: "message" | "abort";
  path: string;
}

type Timer = ReturnType<typeof setInterval>;

export interface AgentModeOptions {
  /** The state folder of the agent, from PI_TMUX_AGENT_DIR. */
  dir: string;
  pollMs?: number;
  setInterval?: (callback: () => void, ms: number) => Timer;
  clearInterval?: (timer: Timer) => void;
  now?: () => number;
}

export interface AgentMode {
  /** Reads the inbox once. The timer calls it; tests call it directly. */
  tick(): void;
}

type UntypedOn = (
  event: string,
  handler: (event: Record<string, unknown>, ctx: ExtensionContext) => unknown,
) => void;

/** Text blocks of the last assistant message, with its stop reason. */
export function extractAssistantText(messages: readonly unknown[] | undefined): TurnResult {
  for (let i = (messages?.length ?? 0) - 1; i >= 0; i--) {
    const msg = messages![i] as {
      role?: unknown; content?: unknown; stopReason?: unknown; errorMessage?: unknown;
    } | undefined;
    if (msg?.role !== "assistant") continue;
    const blocks = Array.isArray(msg.content) ? msg.content : [];
    const text = blocks
      .filter((block: { type?: unknown; text?: unknown }) =>
        block?.type === "text" && typeof block.text === "string")
      .map((block: { text: string }) => block.text)
      .join("\n");
    const result: TurnResult = { text, stopReason: String(msg.stopReason ?? "none") };
    if (typeof msg.errorMessage === "string" && msg.errorMessage.trim() !== "") {
      result.errorMessage = msg.errorMessage.trim();
    }
    return result;
  }
  return { text: "", stopReason: "none" };
}

/** The event that ends a settled run. */
export function settledEvent(
  aborted: boolean,
  result: TurnResult | undefined,
): Pick<TurnLine, "event" | "text" | "message"> {
  if (aborted || result?.stopReason === "aborted") {
    return { event: "interrupted", text: result?.text ?? "", message: "" };
  }
  if (!result) {
    return { event: "error", text: "", message: "the run ended without an assistant message" };
  }
  if (result.stopReason === "stop") {
    return { event: "stop", text: result.text, message: "" };
  }
  const message = result.errorMessage
    ? `${result.stopReason}: ${result.errorMessage}`
    : result.stopReason;
  return { event: "error", text: result.text, message };
}

export function waitingMessage(kind: unknown, title: unknown): string {
  const dialog = typeof kind === "string" && kind ? `${kind} dialog` : "dialog";
  return typeof title === "string" && title.trim() ? `${dialog}: ${title.trim()}` : dialog;
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** mkdir is atomic, so the lock serializes the writers of turns.jsonl. */
function withLock<T>(lock: string, body: () => T): T {
  for (let tries = 0; tries < 20; tries++) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      // A stale lock from a killed writer: take it over after about 1 second.
      sleepSync(50);
    }
  }
  try {
    return body();
  } finally {
    try {
      rmdirSync(lock);
    } catch {
      // Another writer took over a stale lock and removed it.
    }
  }
}

function lineCount(file: string): number {
  try {
    return readFileSync(file, "utf8").split("\n").filter((line) => line.trim() !== "").length;
  } catch {
    // A missing file starts the sequence at 1.
    return 0;
  }
}

/** Appends one event to turns.jsonl. seq is the line number. */
export function appendTurn(
  dir: string,
  entry: Pick<TurnLine, "event" | "text" | "message" | "session_id">,
  now = Date.now(),
): TurnLine {
  const file = join(dir, "turns.jsonl");
  return withLock(join(dir, ".turns.lock"), () => {
    const line: TurnLine = {
      seq: lineCount(file) + 1,
      event: entry.event,
      text: entry.text,
      message: entry.message,
      session_id: entry.session_id,
      ts: Math.floor(now / 1000),
    };
    appendFileSync(file, `${JSON.stringify(line)}\n`);
    return line;
  });
}

export function readLastEvent(dir: string): TurnEvent | undefined {
  let content = "";
  try {
    content = readFileSync(join(dir, "turns.jsonl"), "utf8");
  } catch {
    return undefined;
  }
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  try {
    return (JSON.parse(lines.at(-1) ?? "null") as TurnLine | null)?.event;
  } catch {
    return undefined;
  }
}

/** The requests in the inbox in name order, which is the order of writing. */
export function listInbox(dir: string): InboxEntry[] {
  const inbox = join(dir, "inbox");
  let names: string[];
  try {
    names = readdirSync(inbox);
  } catch {
    return [];
  }
  const entries: InboxEntry[] = [];
  for (const name of names.sort()) {
    // The CLI writes a dot file, then renames it into place.
    if (name.startsWith(".")) continue;
    if (name.endsWith("-message.txt")) entries.push({ name, kind: "message", path: join(inbox, name) });
    else if (name.endsWith("-abort")) entries.push({ name, kind: "abort", path: join(inbox, name) });
  }
  return entries;
}

function writeSessionInfo(dir: string, ctx: ExtensionContext): void {
  const file = join(dir, "session.json");
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({
    session_id: ctx.sessionManager.getSessionId(),
    session_file: ctx.sessionManager.getSessionFile() ?? "",
  })}\n`);
  renameSync(tmp, file);
}

function remove(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // The file is already gone. A request is never handled twice.
  }
}

/**
 * Agent mode: record the turn events of this pi in turns.jsonl, and deliver
 * the inbox requests of the CLI. Nothing here throws into pi: a failed write
 * only costs the lead one event, and the lead then reads the screen.
 */
export function registerAgentMode(pi: ExtensionAPI, options: AgentModeOptions): AgentMode {
  const { dir } = options;
  const pollMs = options.pollMs ?? 500;
  const startTimer = options.setInterval ?? setInterval;
  const stopTimer = options.clearInterval ?? clearInterval;
  const now = options.now ?? Date.now;
  const on = pi.on.bind(pi) as unknown as UntypedOn;

  let ctx: ExtensionContext | undefined;
  let timer: Timer | undefined;
  let lastEvent: TurnEvent | undefined;
  let pending: TurnResult | undefined;
  let dialogOpen = false;
  let abortPending = false;

  function write(event: TurnEvent, text = "", message = ""): void {
    try {
      const sessionId = ctx?.sessionManager.getSessionId() ?? "";
      appendTurn(dir, { event, text, message, session_id: sessionId }, now());
      lastEvent = event;
    } catch {
      // The state folder is gone or not writable. See the function comment.
    }
  }

  function markWorking(): void {
    // A dialog that waits keeps the waiting state until it closes.
    if (dialogOpen || lastEvent === "working") return;
    write("working");
  }

  function deliver(text: string, current: ExtensionContext): void {
    if (current.isIdle()) pi.sendUserMessage(text);
    else pi.sendUserMessage(text, { deliverAs: "followUp" });
  }

  function tick(): void {
    const current = ctx;
    if (!current) return;
    try {
      if (abortPending && current.isIdle()) abortPending = false;
      // Once one message waits, the later messages wait behind it.
      let holding = dialogOpen || abortPending;
      for (const entry of listInbox(dir)) {
        if (entry.kind === "abort") {
          if (!current.isIdle()) {
            current.abort();
            // A message that follows an abort starts a new run after the
            // aborted run settles, instead of joining the aborted run.
            abortPending = true;
            holding = true;
          }
          remove(entry.path);
          continue;
        }
        if (holding) continue;
        let text: string;
        try {
          text = readFileSync(entry.path, "utf8");
        } catch {
          continue;
        }
        remove(entry.path);
        if (text.trim()) deliver(text, current);
      }
    } catch {
      // The next tick tries again. See the function comment.
    }
  }

  function stop(): void {
    if (timer !== undefined) stopTimer(timer);
    timer = undefined;
  }

  pi.on("session_start", (_event, startCtx) => {
    stop();
    ctx = startCtx;
    dialogOpen = false;
    abortPending = false;
    pending = undefined;
    lastEvent = readLastEvent(dir);
    try {
      writeSessionInfo(dir, startCtx);
    } catch {
      // The result card then has no session file. See the function comment.
    }
    // The first prompt waits for the first tick: pi can drop a message that
    // arrives before it is ready.
    timer = startTimer(tick, pollMs);
    (timer as { unref?: () => void }).unref?.();
  });

  pi.on("session_shutdown", () => {
    stop();
    ctx = undefined;
  });

  pi.on("input", () => {
    markWorking();
  });

  pi.on("agent_start", () => {
    markWorking();
  });

  on("ui_prompt_start", (event, eventCtx) => {
    dialogOpen = true;
    // A dialog outside a run comes from a command that the user typed in the
    // agent window. The lead does not need to answer it.
    if (eventCtx.isIdle()) return;
    write("waiting", "", waitingMessage(event.kind, event.title));
  });

  on("ui_prompt_end", (_event, eventCtx) => {
    dialogOpen = false;
    if (lastEvent === "waiting" && !eventCtx.isIdle()) write("working");
  });

  // agent_end can fire more than once for one run (retries, compaction
  // recovery, queued follow-ups), so keep the last result and write it when
  // the run settles.
  pi.on("agent_end", (event) => {
    pending = extractAssistantText((event as { messages?: unknown[] }).messages);
  });

  on("agent_settled", (event) => {
    const result = pending;
    pending = undefined;
    const settled = settledEvent(event.aborted === true, result);
    write(settled.event, settled.text, settled.message);
  });

  return { tick };
}
