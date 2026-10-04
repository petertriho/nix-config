import type { RunningSubagent } from "../execution/services.ts";
import { classifyStatus, type StatusConfig, type StatusSnapshot } from "../telemetry/status.ts";
import {
  applyPanelMargin, chooseWidthCandidate, formatIdentity, formatMetadata,
  formatSeparator, formatState, renderPanelBottom, renderPanelRow,
  renderPanelTop, sanitizeDisplayLine, type SemanticState, type UiTheme,
} from "./ui.ts";

interface WidgetStatusPresentation {
  state: Extract<SemanticState, "starting" | "running" | "active" | "waiting" | "stalled">;
  detail?: string;
  duration?: string;
}

export function formatWidgetRightLabel(snapshot: StatusSnapshot): WidgetStatusPresentation {
  if (snapshot.kind === "starting") return { state: "starting" };
  if (snapshot.kind === "running") {
    return { state: "running", duration: snapshot.elapsedText };
  }
  if (snapshot.kind === "active") {
    const label = snapshot.activityLabel ?? snapshot.activeScope;
    return {
      state: "active",
      ...(label ? { detail: label } : {}),
      ...(snapshot.activeDurationText ? { duration: snapshot.activeDurationText } : {}),
    };
  }
  if (snapshot.kind === "waiting") {
    return {
      state: "waiting",
      ...(snapshot.statusLabel ? { detail: snapshot.statusLabel } : {}),
      ...(snapshot.waitingDurationText ? { duration: snapshot.waitingDurationText } : {}),
    };
  }

  return {
    state: "stalled",
    ...(snapshot.statusLabel ? { detail: snapshot.statusLabel } : {}),
    ...(snapshot.snapshotProblemText ? { duration: snapshot.snapshotProblemText } : {}),
  };
}

function formatElapsedMMSS(startTime: number): string {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function renderWidgetAgentContent(
  theme: UiTheme,
  agent: RunningSubagent,
  snapshot: StatusSnapshot,
  width: number,
): string {
  const status = formatWidgetRightLabel(snapshot);
  const elapsed = formatMetadata(theme, formatElapsedMMSS(agent.startTime));
  const fullIdentity = formatIdentity(theme, agent.name, agent.agent);
  const compactIdentity = formatIdentity(theme, agent.name);
  const state = formatState(theme, status.state);
  const glyph = formatState(theme, status.state, { glyphOnly: true });
  const detail = status.detail
    ? `${formatSeparator(theme)}${formatMetadata(theme, sanitizeDisplayLine(status.detail))}`
    : "";
  const duration = status.duration
    ? ` ${formatMetadata(theme, sanitizeDisplayLine(status.duration))}`
    : "";

  return chooseWidthCandidate(
    [
      `${elapsed}${formatSeparator(theme)}${fullIdentity}${formatSeparator(theme)}${state}${detail}${duration}`,
      `${compactIdentity}${formatSeparator(theme)}${state}${detail}`,
      `${compactIdentity}${formatSeparator(theme)}${state}`,
      state,
      glyph,
    ],
    width,
  );
}

/**
 * Wrap widget lines in the same 1-column outer margin pi-tui-shell applies to
 * the editor frame (`applyOuterMargin`): ` line ` padded/truncated to width.
 * Keeps the Subagents panel's left and right edges flush with the editor box
 * instead of spanning the full terminal width from column 0.
 */
export function applyWidgetMargin(lines: string[], width: number): string[] {
  return applyPanelMargin(lines, width);
}

export function createWidgetRenderer(statusConfig: StatusConfig) {
  function renderSubagentWidgetLines(
    theme: UiTheme,
    agents: RunningSubagent[],
    width: number,
  ): string[] {
    const count = agents.length;
    const lines: string[] = [renderPanelTop(theme, width, "Subagents", `${count} running`)];

    for (const agent of agents) {
      const snapshot = classifyStatus(agent.statusState, Date.now());
      let visibleStatus = snapshot;
      if (!statusConfig.enabled) {
        visibleStatus = {
          ...snapshot,
          kind: agent.cli === "claude" ? "running" : "starting",
          activeDurationText: null,
          waitingDurationText: null,
          snapshotProblemText: null,
          statusLabel: null,
        };
      }
      lines.push(
        renderPanelRow(
          theme,
          width,
          renderWidgetAgentContent(theme, agent, visibleStatus, Math.max(0, width - 2)),
        ),
      );
    }

    lines.push(renderPanelBottom(theme, width));
    return lines;
  }
  return renderSubagentWidgetLines;
}
