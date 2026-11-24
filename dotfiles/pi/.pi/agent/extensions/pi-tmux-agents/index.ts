/**
 * pi-tmux-agents: pi agents in tmux windows for a pi lead session.
 *
 * Every pi session loads this extension, and the environment picks its mode:
 * - Agent mode, in a pi that `pi-tmux-agents launch` started: record the turn
 *   events and deliver the inbox requests of the CLI.
 * - Lead mode, in a pi that no agent tool started: the TmuxAgent* tools, the
 *   panel, and one follow-up message for each turn end of an agent.
 * - No mode, in a pi tmux agent without its folder, a tmux worker, or a pi
 *   subagent. These sessions cannot start agents.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerAgentMode } from "./agent.ts";
import { registerLeadMode } from "./lead.ts";

export type Mode = "agent" | "lead" | "none";

const AGENT_MARKERS = [
  "PI_TMUX_AGENT_ID", "TMUX_WORKER_ID", "PI_SUBAGENT_ID", "PI_SUBAGENT_SESSION",
] as const;

export function pickMode(env: NodeJS.ProcessEnv): Mode {
  if (env.PI_TMUX_AGENT_ID && env.PI_TMUX_AGENT_DIR) return "agent";
  if (AGENT_MARKERS.some((name) => env[name])) return "none";
  return "lead";
}

export default function piTmuxAgents(pi: ExtensionAPI): void {
  const mode = pickMode(process.env);
  if (mode === "agent") registerAgentMode(pi, { dir: process.env.PI_TMUX_AGENT_DIR! });
  else if (mode === "lead") registerLeadMode(pi);
}
