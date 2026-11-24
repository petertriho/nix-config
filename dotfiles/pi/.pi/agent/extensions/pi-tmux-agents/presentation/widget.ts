import type { AgentStatus, ListedAgent } from "../cli.ts";
import {
  applyPanelMargin, chooseWidthCandidate, formatIdentity, formatMetadata,
  formatSeparator, formatState, renderPanelBottom, renderPanelRow,
  renderPanelTop, type SemanticState, type UiTheme,
} from "./ui.ts";

export const WIDGET_KEY = "pi-tmux-agents";
export const PANEL_TITLE = "tmux agents";

/** The panel hides stopped agents. */
export type PanelStatus = Exclude<AgentStatus, "stopped">;

/** Agent status to the panel states of pi-subagents. The order is the order of the counts. */
export const STATUS_PRESENTATIONS: Readonly<Record<PanelStatus, { state: SemanticState; label: string }>> = {
  starting: { state: "starting", label: "starting" },
  working: { state: "running", label: "working" },
  waiting: { state: "help", label: "needs input" },
  idle: { state: "completed", label: "idle" },
  error: { state: "failed", label: "error" },
  dead: { state: "stalled", label: "gone" },
};

export function panelAgents(agents: readonly ListedAgent[]): Array<ListedAgent & { status: PanelStatus }> {
  return agents.filter((agent): agent is ListedAgent & { status: PanelStatus } =>
    agent.status !== "stopped");
}

/** mm:ss from `since` (epoch seconds) to `now` (epoch milliseconds). */
export function formatSince(since: number, now: number): string {
  const seconds = since > 0 ? Math.max(0, Math.floor(now / 1000 - since)) : 0;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** For example "2 working · 1 needs input". */
export function summarizeStatuses(agents: readonly ListedAgent[]): string {
  const counts = new Map<PanelStatus, number>();
  for (const agent of panelAgents(agents)) {
    counts.set(agent.status, (counts.get(agent.status) ?? 0) + 1);
  }
  return (Object.keys(STATUS_PRESENTATIONS) as PanelStatus[])
    .filter((status) => counts.has(status))
    .map((status) => `${counts.get(status)} ${STATUS_PRESENTATIONS[status].label}`)
    .join(" · ");
}

/** One row, with the richest layout that fits the width. */
export function renderAgentRow(
  theme: UiTheme,
  agent: ListedAgent & { status: PanelStatus },
  width: number,
  now: number,
): string {
  const presentation = STATUS_PRESENTATIONS[agent.status];
  const state = formatState(theme, presentation.state, { label: presentation.label });
  const glyph = formatState(theme, presentation.state, { glyphOnly: true });
  const elapsed = formatMetadata(theme, formatSince(agent.since, now));
  const role = [agent.agent_type, agent.target].filter(Boolean).join(" · ");
  return chooseWidthCandidate(
    [
      `${elapsed}${formatSeparator(theme)}${formatIdentity(theme, agent.name, role)}${formatSeparator(theme)}${state}`,
      ...(agent.agent_type
        ? [`${formatIdentity(theme, agent.name, agent.agent_type)}${formatSeparator(theme)}${state}`]
        : []),
      `${formatIdentity(theme, agent.name)}${formatSeparator(theme)}${state}`,
      glyph,
    ],
    width,
  );
}

/** The panel box, or no lines when the lead has no agent to show. */
export function renderPanelLines(
  theme: UiTheme,
  agents: readonly ListedAgent[],
  width: number,
  now: number,
): string[] {
  const visible = panelAgents(agents);
  if (visible.length === 0) return [];
  const lines = [renderPanelTop(theme, width, PANEL_TITLE, summarizeStatuses(visible))];
  for (const agent of visible) {
    lines.push(renderPanelRow(theme, width, renderAgentRow(theme, agent, Math.max(0, width - 2), now)));
  }
  lines.push(renderPanelBottom(theme, width));
  return lines;
}

/** The widget lines, with the one-column margin of the pi-subagents panel. */
export function renderWidgetLines(
  theme: UiTheme,
  agents: readonly ListedAgent[],
  width: number,
  now: number,
): string[] {
  return applyPanelMargin(renderPanelLines(theme, agents, Math.max(0, width - 2), now), width);
}
