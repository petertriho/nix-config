import { homedir } from "node:os";
import { join } from "node:path";

/** Events that `pi-tmux-agents pull` reports. `gone` exists only in pull. */
export type PulledEvent = "stop" | "error" | "waiting" | "interrupted" | "gone";

/** Statuses that `pi-tmux-agents list --json` reports. */
export type AgentStatus =
  | "starting"
  | "working"
  | "waiting"
  | "idle"
  | "error"
  | "dead"
  | "stopped";

export interface PullRecord {
  id: string;
  name: string;
  event: PulledEvent;
  turn: number;
  text: string;
  message: string;
  target: string;
  pane: string;
  cwd: string;
  session_file: string;
  ts: number;
  screen: string;
  exit_status: string;
}

export interface ListedAgent {
  id: string;
  name: string;
  lead_session: string;
  session: string;
  window: string;
  pane: string;
  target: string;
  cwd: string;
  dir: string;
  status: AgentStatus;
  since: number;
  turn: number;
  message: string;
  last_text: string;
  created: number;
}

export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface CliOptions {
  signal?: AbortSignal;
  timeout?: number;
  cwd?: string;
}

export type CliRunner = (args: string[], options?: CliOptions) => Promise<CliResult>;

type Exec = (command: string, args: string[], options?: CliOptions) => Promise<CliResult>;

const PULLED_EVENTS: readonly PulledEvent[] = ["stop", "error", "waiting", "interrupted", "gone"];
const STATUSES: readonly AgentStatus[] = [
  "starting", "working", "waiting", "idle", "error", "dead", "stopped",
];

/** PI_TMUX_AGENTS_CLI replaces the CLI on PATH, for tests. */
export function cliCommand(env: NodeJS.ProcessEnv = process.env): string {
  return env.PI_TMUX_AGENTS_CLI || "pi-tmux-agents";
}

/** The state folder of the CLI, with the same precedence as the CLI. */
export function stateRoot(env: NodeJS.ProcessEnv = process.env): string {
  if (env.PI_TMUX_AGENTS_STATE_DIR) return env.PI_TMUX_AGENTS_STATE_DIR;
  const base = env.XDG_STATE_HOME || join(homedir(), ".local", "state");
  return join(base, "pi-tmux-agents");
}

/** pi.exec runs the CLI without a shell, so no argument needs quoting. */
export function createCliRunner(exec: Exec, command = cliCommand()): CliRunner {
  return (args, options) => exec(command, args, options);
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** One record for each JSON line of `pull --json`. A bad line is skipped. */
export function parsePull(stdout: string): PullRecord[] {
  const records: PullRecord[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    const event = raw.event as PulledEvent;
    if (!PULLED_EVENTS.includes(event) || !text(raw.id)) continue;
    records.push({
      id: text(raw.id),
      name: text(raw.name) || text(raw.id),
      event,
      turn: count(raw.turn),
      text: text(raw.text),
      message: text(raw.message),
      target: text(raw.target),
      pane: text(raw.pane),
      cwd: text(raw.cwd),
      session_file: text(raw.session_file),
      ts: count(raw.ts),
      screen: text(raw.screen),
      exit_status: text(raw.exit_status),
    });
  }
  return records;
}

/** The agents of `list --json`. Output that is not a JSON array gives none. */
export function parseList(stdout: string): ListedAgent[] {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const agents: ListedAgent[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const status = entry.status as AgentStatus;
    if (!text(entry.id) || !STATUSES.includes(status)) continue;
    agents.push({
      id: text(entry.id),
      name: text(entry.name) || text(entry.id),
      lead_session: text(entry.lead_session),
      session: text(entry.session),
      window: text(entry.window),
      pane: text(entry.pane),
      target: text(entry.target),
      cwd: text(entry.cwd),
      dir: text(entry.dir),
      status,
      since: count(entry.since),
      turn: count(entry.turn),
      message: text(entry.message),
      last_text: text(entry.last_text),
      created: count(entry.created),
    });
  }
  return agents;
}

/** The trailer line that `wait` prints, also at the end of each result. */
export function formatTrailer(record: Pick<PullRecord, "id" | "target" | "pane" | "turn" | "event">): string {
  return `pi-tmux-agents: id=${record.id} target=${record.target} pane=${record.pane} turn=${record.turn} event=${record.event}`;
}
