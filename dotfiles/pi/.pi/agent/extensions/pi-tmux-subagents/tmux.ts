import { execFile, execFileSync, execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

/**
 * tmux backend for pi-tmux-subagents.
 *
 * Ported from the upstream pi-interactive-subagents `cmux.ts` with only the
 * tmux branches kept. A "surface" is a tmux pane id such as `%12`.
 */

const execFileAsync = promisify(execFile);

let tmuxOnPath: boolean | undefined;

function hasTmuxCommand(): boolean {
  if (tmuxOnPath !== undefined) return tmuxOnPath;
  try {
    execSync("command -v tmux", { stdio: "ignore" });
    tmuxOnPath = true;
  } catch {
    tmuxOnPath = false;
  }
  return tmuxOnPath;
}

/** True when pi runs inside a tmux client and the `tmux` binary is on PATH. */
export function isTmuxAvailable(): boolean {
  return !!process.env.TMUX && hasTmuxCommand();
}

export function muxSetupHint(): string {
  return "Start pi inside tmux (`tmux new -A -s pi 'pi'`).";
}

function requireTmux(): void {
  if (!isTmuxAvailable()) {
    throw new Error(`tmux is not available. ${muxSetupHint()}`);
  }
}

export function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

// Pure argument builders. Kept separate so unit tests can run without tmux.

export function buildSplitWindowArgs(fromPane: string | undefined): string[] {
  const args = ["split-window", "-d", "-h"];
  if (fromPane) args.push("-t", fromPane);
  args.push("-P", "-F", "#{pane_id}");
  return args;
}

export function parsePaneId(output: string): string {
  const pane = output.trim();
  if (!pane.startsWith("%")) {
    throw new Error(`Unexpected tmux split-window output: ${pane}`);
  }
  return pane;
}

export function buildCapturePaneArgs(pane: string, lines: number): string[] {
  return ["capture-pane", "-p", "-t", pane, "-S", `-${Math.max(1, lines)}`];
}

export function buildSendKeysArgs(
  pane: string,
  text: string,
  options: { literal: boolean },
): string[] {
  const args = ["send-keys", "-t", pane];
  if (options.literal) args.push("-l");
  args.push(text);
  return args;
}

function tmux(args: string[]): string {
  return execFileSync("tmux", args, { encoding: "utf8" });
}

/**
 * Create a new pane to the right of the parent pi pane and return its id.
 * The split targets `TMUX_PANE` so panes follow the agent, not the user's focus.
 */
export function createSurface(name: string): string {
  requireTmux();
  const pane = parsePaneId(tmux(buildSplitWindowArgs(process.env.TMUX_PANE)));
  try {
    tmux(["select-pane", "-t", pane, "-T", name]);
  } catch {
    // Pane title is cosmetic.
  }
  return pane;
}

export function sendCommand(pane: string, command: string): void {
  requireTmux();
  tmux(buildSendKeysArgs(pane, command, { literal: true }));
  tmux(buildSendKeysArgs(pane, "Enter", { literal: false }));
}

/** Send one Escape keypress to a pane. */
export function sendEscape(pane: string): void {
  requireTmux();
  tmux(buildSendKeysArgs(pane, "Escape", { literal: false }));
}

/**
 * Build the contents of a launch script.
 *
 * Every preamble line is forced to start with `#`. The preamble carries
 * untrusted values (a subagent display name), and a name containing a newline
 * would otherwise inject an executable line into the script. Commenting each
 * line keeps the preamble inert. The command itself is the caller's already
 * shell-safe invocation and is written verbatim as the last line.
 */
export function buildLaunchScript(command: string, preamble?: string): string {
  const parts = ["#!/bin/bash"];
  if (preamble) {
    for (const rawLine of preamble.split("\n")) {
      const line = rawLine.trimEnd();
      parts.push(line.startsWith("#") ? line : `# ${line}`);
    }
  }
  parts.push(command);
  return parts.join("\n") + "\n";
}

/**
 * Send a long command by writing it to an executable script first. This avoids
 * line-wrapping problems when a command exceeds the pane width. Returns the
 * script path. Callers can pass a stable `scriptPath` so the exact invocation
 * stays available for debugging.
 */
export function sendLongCommand(
  pane: string,
  command: string,
  options?: { scriptPath?: string; scriptPreamble?: string },
): string {
  const scriptPath =
    options?.scriptPath ??
    join(
      tmpdir(),
      "pi-subagent-scripts",
      `cmd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.sh`,
    );
  mkdirSync(dirname(scriptPath), { recursive: true });

  writeFileSync(scriptPath, buildLaunchScript(command, options?.scriptPreamble), { mode: 0o755 });
  sendCommand(pane, `bash ${shellEscape(scriptPath)}`);
  return scriptPath;
}

export function readScreen(pane: string, lines = 50): string {
  requireTmux();
  return tmux(buildCapturePaneArgs(pane, lines));
}

export async function readScreenAsync(pane: string, lines = 50): Promise<string> {
  requireTmux();
  const { stdout } = await execFileAsync("tmux", buildCapturePaneArgs(pane, lines), {
    encoding: "utf8",
  });
  return stdout;
}

export function closeSurface(pane: string): void {
  requireTmux();
  tmux(["kill-pane", "-t", pane]);
}

/** Rename the tmux window that owns the parent pi pane. */
export function renameCurrentTab(title: string): void {
  requireTmux();
  const paneId = process.env.TMUX_PANE;
  if (!paneId) throw new Error("TMUX_PANE not set");
  const windowId = tmux(["display-message", "-p", "-t", paneId, "#{window_id}"]).trim();
  tmux(["rename-window", "-t", windowId, title]);
}

export interface PollResult {
  /** How the subagent exited */
  reason: "done" | "ping" | "sentinel" | "error";
  /** Shell exit code (from sentinel). 0 for file-based exits. */
  exitCode: number;
  /** Ping data if reason is "ping" */
  ping?: { name: string; message: string };
  /** Error message if reason is "error" (auto-retry exhausted, provider overload, etc.) */
  errorMessage?: string;
}

/**
 * Interpret an `.exit` sidecar payload written by `subagent_done`,
 * `caller_ping`, or the error path in `subagent-done.ts`.
 */
export function interpretExitSidecar(data: unknown): PollResult {
  const payload = (data ?? {}) as Record<string, unknown>;
  if (payload.type === "ping") {
    return {
      reason: "ping",
      exitCode: 0,
      ping: { name: String(payload.name ?? ""), message: String(payload.message ?? "") },
    };
  }
  if (payload.type === "error") {
    const errorMessage =
      typeof payload.errorMessage === "string" && payload.errorMessage.trim() !== ""
        ? payload.errorMessage
        : "Subagent exited with stopReason=error (no errorMessage in sidecar).";
    return { reason: "error", exitCode: 1, errorMessage };
  }
  return { reason: "done", exitCode: 0 };
}

function readExitSidecar(sessionFile: string): PollResult | null {
  try {
    const exitFile = `${sessionFile}.exit`;
    if (!existsSync(exitFile)) return null;
    const data = JSON.parse(readFileSync(exitFile, "utf8"));
    rmSync(exitFile, { force: true });
    return interpretExitSidecar(data);
  } catch {
    return null;
  }
}

/**
 * Poll until the subagent exits. Checks the `.exit` sidecar first, then an
 * optional sentinel file (Claude Code Stop hook), then the terminal screen for
 * the `__SUBAGENT_DONE_<code>__` sentinel used for crash detection.
 */
export async function pollForExit(
  pane: string,
  signal: AbortSignal,
  options: {
    interval: number;
    sessionFile?: string;
    sentinelFile?: string;
    onTick?: (elapsed: number) => void;
  },
): Promise<PollResult> {
  const start = Date.now();

  for (;;) {
    if (signal.aborted) {
      throw new Error("Aborted while waiting for subagent to finish");
    }

    if (options.sessionFile) {
      const result = readExitSidecar(options.sessionFile);
      if (result) return result;
    }

    if (options.sentinelFile) {
      try {
        if (existsSync(options.sentinelFile)) {
          return { reason: "sentinel", exitCode: 0 };
        }
      } catch {}
    }

    try {
      const screen = await readScreenAsync(pane, 5);
      const match = screen.match(/__SUBAGENT_DONE_(\d+)__/);
      if (match) {
        return { reason: "sentinel", exitCode: parseInt(match[1], 10) };
      }
    } catch {
      // The pane may be gone. Check whether the sidecar appeared in the meantime.
      if (options.sessionFile) {
        const result = readExitSidecar(options.sessionFile);
        if (result) return result;
      }
    }

    const elapsed = Math.floor((Date.now() - start) / 1000);
    options.onTick?.(elapsed);

    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new Error("Aborted"));
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, options.interval);
      function onAbort() {
        clearTimeout(timer);
        reject(new Error("Aborted"));
      }
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
