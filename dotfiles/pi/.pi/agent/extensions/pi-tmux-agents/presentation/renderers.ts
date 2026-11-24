import { keyText, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Box, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { formatTrailer, type ListedAgent, type PulledEvent, type PullRecord } from "../cli.ts";
import {
  formatIdentity, formatKeyHint, formatMetadata, formatSeparator, formatState,
  formatStateLabel, sanitizeDisplayLine, sanitizeDisplayText, span,
  type SemanticState, type UiTheme,
} from "./ui.ts";
import { panelAgents, STATUS_PRESENTATIONS } from "./widget.ts";

export const RESULT_TYPE = "pi_tmux_agents_result";

type CardBg = "toolSuccessBg" | "toolErrorBg" | "customMessageBg";

/**
 * The look of each event. A waiting card uses the background of the
 * pi-subagents "needs help" card (subagent_ping), which has the same state.
 */
export const EVENT_PRESENTATIONS: Readonly<Record<PulledEvent, { state: SemanticState; label: string; bg: CardBg }>> = {
  stop: { state: "completed", label: "turn ended", bg: "toolSuccessBg" },
  error: { state: "failed", label: "error", bg: "toolErrorBg" },
  interrupted: { state: "failed", label: "interrupted", bg: "toolErrorBg" },
  waiting: { state: "help", label: "needs input", bg: "customMessageBg" },
  gone: { state: "stalled", label: "gone", bg: "toolErrorBg" },
};

/** The body of a result: the reply, or what happened and the screen. */
export function resultBody(record: PullRecord): string {
  const parts: string[] = [];
  switch (record.event) {
    case "stop":
      parts.push(record.text || "(The reply has no text.)");
      if (record.auto_stopped) parts.push("The window closed (auto-stop). SendMessage resumes the agent.");
      break;
    case "error":
      parts.push(`Error: ${record.message || "unknown"}`);
      if (record.text) parts.push(record.text);
      break;
    case "interrupted":
      parts.push("The turn was interrupted.");
      if (record.text) parts.push(record.text);
      break;
    case "waiting":
      parts.push(`The agent waits on a ${record.message || "dialog"}. Only the user can answer it in the window ${record.target}. AgentInterrupt cancels it.`);
      if (record.screen) parts.push(record.screen);
      break;
    case "gone":
      parts.push(record.text || "pi or its pane is gone.");
      if (record.screen) parts.push(record.screen);
      break;
  }
  return parts.join("\n\n");
}

/** The type and the window of an agent, for example "Explore · repo:api". */
export function agentRole(agentType: string, target: string): string {
  return [agentType, target].filter(Boolean).join(" · ");
}

function headline(record: PullRecord): string {
  const who = `Agent "${record.name}" (${agentRole(record.agent_type, record.target)})`;
  switch (record.event) {
    case "stop": return `${who} ended turn ${record.turn}.`;
    case "error": return `${who} ended turn ${record.turn} with an error.`;
    case "interrupted": return `${who} was interrupted in turn ${record.turn}.`;
    case "waiting": return `${who} needs input.`;
    case "gone": return `${who} is gone.`;
  }
}

/** The model-facing text of a result: a headline, the body, and the trailer. */
export function buildResultContent(record: PullRecord): string {
  const trailer = formatTrailer(record) + (record.event === "error" && record.message
    ? ` error=${record.message.replace(/\n/g, " ")}`
    : "");
  return `${headline(record)}\n\n${resultBody(record)}\n\n${trailer}`;
}

function outputPadOf(options: { outputPad?: number }): number {
  return Number.isFinite(options.outputPad) ? Math.max(0, Math.floor(options.outputPad!)) : 1;
}

/** The configured expand key. Pi 1.6 passes keyText in the options. */
function expandKey(options: object): string {
  const fromOptions = (options as { keyText?: (id: string) => string }).keyText;
  return fromOptions ? fromOptions("app.tools.expand") : keyText("app.tools.expand");
}

/** The result card lines, without the box. Exported for tests. */
export function renderResultLines(
  record: PullRecord,
  expanded: boolean,
  theme: UiTheme,
  lineWidth: number,
  expandKeyText: string,
): string[] {
  const presentation = EVENT_PRESENTATIONS[record.event];
  const header =
    `${formatState(theme, presentation.state, { glyphOnly: true })} ` +
    `${formatIdentity(theme, record.name, agentRole(record.agent_type, record.target))}` +
    `${formatSeparator(theme, "—")}` +
    `${formatStateLabel(theme, presentation.state, presentation.label)} ` +
    `${formatMetadata(theme, `(turn ${record.turn})`)}`;
  const lines = [truncateToWidth(header, lineWidth, "")];
  const body = sanitizeDisplayText(resultBody(record)).split("\n");
  if (expanded) {
    for (const line of body) lines.push(truncateToWidth(line, lineWidth, ""));
    lines.push("");
    if (record.session_file) {
      lines.push(truncateToWidth(
        span(theme, "dim", `Session: ${sanitizeDisplayLine(record.session_file)}`), lineWidth, ""));
    }
    lines.push(truncateToWidth(
      span(theme, "dim", `Resume:  pi-tmux-agents send ${sanitizeDisplayLine(record.id)} ...`), lineWidth, ""));
  } else {
    for (const line of body.slice(0, 5)) {
      lines.push(truncateToWidth(span(theme, "dim", line), lineWidth, ""));
    }
    if (body.length > 5) {
      lines.push(truncateToWidth(formatMetadata(theme, `… ${body.length - 5} more lines`), lineWidth, ""));
    }
    lines.push(truncateToWidth(formatKeyHint(theme, expandKeyText, "to expand"), lineWidth, ""));
  }
  return lines;
}

export function registerResultRenderer(pi: Pick<ExtensionAPI, "registerMessageRenderer">): void {
  pi.registerMessageRenderer(RESULT_TYPE, (message, options, theme) => {
    const record = message.details as PullRecord | undefined;
    if (!record || !EVENT_PRESENTATIONS[record.event]) return undefined;
    return {
      invalidate() {},
      render(width: number): string[] {
        const outputPad = outputPadOf(options);
        const lineWidth = Math.max(0, width - outputPad * 2);
        const bg = EVENT_PRESENTATIONS[record.event].bg;
        const box = new Box(outputPad, 1, (text: string) => theme.bg(bg, text));
        box.addChild(new Text(
          renderResultLines(record, options.expanded, theme, lineWidth, expandKey(options)).join("\n"),
          0,
          0,
        ));
        return ["", ...box.render(width)];
      },
    };
  });
}

// Tool rows follow pi-subagents/presentation/tool-renderers.ts:
// identity · metadata · state.

export type ToolAction = "agent" | "send" | "read" | "interrupt" | "stop" | "list";

export interface ToolDetails {
  action: ToolAction;
  agent?: string;
  id?: string;
  name?: string;
  target?: string;
  agentType?: string;
  description?: string;
  worktree?: string;
  branch?: string;
  background?: boolean;
  /** The event that ended a foreground Agent call. */
  event?: string;
  autoStopped?: boolean;
  status?:
    | "started" | "completed" | "waiting" | "interrupted" | "failed"
    | "queued" | "reopened" | "interrupt_requested" | "no_turn" | "stopped" | "read" | "listed";
  error?: string;
  agents?: ListedAgent[];
  screen?: string;
}

interface ToolRenderResult {
  content?: Array<{ type?: string; text?: string }>;
  details?: unknown;
}

export function renderToolStateRow(
  theme: UiTheme,
  input: { name: string; role?: string; state: SemanticState; label: string; metadata?: string },
): string {
  const metadata = input.metadata
    ? `${formatSeparator(theme)}${formatMetadata(theme, input.metadata)}`
    : "";
  return `${formatIdentity(theme, input.name, input.role)}${metadata}${formatSeparator(theme)}${formatState(theme, input.state, { label: input.label })}`;
}

function firstText(result: ToolRenderResult): string {
  const first = result.content?.[0];
  return first?.type === "text" && typeof first.text === "string" ? first.text : "";
}

function renderToolFallback(result: ToolRenderResult, theme: UiTheme): Text {
  const details = result.details as ToolDetails | undefined;
  const text = sanitizeDisplayText(firstText(result));
  const failed = details?.error != null;
  const state = failed ? "failed" : "completed";
  const body = span(theme, failed ? "error" : "toolOutput", text);
  return new Text(`${formatState(theme, state)}${text ? `${formatSeparator(theme)}${body}` : ""}`, 0, 0);
}

function textPreview(theme: UiTheme, text: string): string {
  const lines = sanitizeDisplayText(text).split("\n");
  const first = lines.find((line) => line.trim()) ?? "";
  const preview = truncateToWidth(first, 100, "…");
  if (!preview) return "";
  const total = lines.length > 1 ? ` ${formatMetadata(theme, `(${lines.length} lines)`)}` : "";
  return `\n${span(theme, "toolOutput", preview)}${total}`;
}

function argText(args: unknown, key: string): string {
  const value = (args as Record<string, unknown> | undefined)?.[key];
  return typeof value === "string" ? value : "";
}

function agentLabel(details: ToolDetails | undefined, fallback: string): string {
  return details?.name ?? details?.id ?? details?.agent ?? fallback;
}

const AGENT_RESULT_PRESENTATIONS: Readonly<Record<string, { state: SemanticState; label: string }>> = {
  started: { state: "starting", label: "started in background" },
  completed: { state: "completed", label: "turn ended" },
  waiting: { state: "help", label: "needs input" },
  interrupted: { state: "failed", label: "interrupted" },
  failed: { state: "failed", label: "failed" },
};

export const agentToolRenderers = {
  renderCall(args: unknown, theme: UiTheme) {
    const cwd = argText(args, "cwd");
    const isolated = argText(args, "isolation") === "worktree";
    const where = [isolated ? "new worktree" : "", cwd ? `in ${cwd}` : ""].filter(Boolean).join(" ");
    const text = renderToolStateRow(theme, {
      name: argText(args, "name") || argText(args, "description") || "(unnamed)",
      role: argText(args, "subagent_type") || "general-purpose",
      state: "starting",
      label: (args as { run_in_background?: unknown } | undefined)?.run_in_background === true ? "background" : "pending",
      metadata: where || undefined,
    }) + textPreview(theme, argText(args, "prompt"));
    return new Text(text, 0, 0);
  },
  renderResult(result: ToolRenderResult, options: { expanded?: boolean }, theme: UiTheme) {
    const details = result.details as ToolDetails | undefined;
    const presentation = details?.status ? AGENT_RESULT_PRESENTATIONS[details.status] : undefined;
    if (!details || !presentation || (details.status === "failed" && !details.id)) {
      return renderToolFallback(result, theme);
    }
    const row = renderToolStateRow(theme, {
      name: agentLabel(details, "agent"),
      role: agentRole(details.agentType ?? "", details.target ?? ""),
      state: presentation.state,
      label: details.autoStopped ? `${presentation.label}, window closed` : presentation.label,
      metadata: details.worktree ? `${details.id} · ${details.branch ?? details.worktree}` : details.id,
    });
    if (details.status === "started") return new Text(row, 0, 0);
    const reply = firstText(result);
    const body = options.expanded
      ? `\n${sanitizeDisplayText(reply).split("\n").map((line) => span(theme, "toolOutput", line)).join("\n")}`
      : textPreview(theme, reply);
    return new Text(row + body, 0, 0);
  },
};

export const sendToolRenderers = {
  renderCall(args: unknown, theme: UiTheme) {
    const text = renderToolStateRow(theme, {
      name: argText(args, "to") || "(unknown)",
      state: "running",
      label: "send",
    }) + textPreview(theme, argText(args, "message"));
    return new Text(text, 0, 0);
  },
  renderResult(result: ToolRenderResult, _options: unknown, theme: UiTheme) {
    const details = result.details as ToolDetails | undefined;
    if (details?.status === "queued" || details?.status === "reopened") {
      return new Text(renderToolStateRow(theme, {
        name: agentLabel(details, "agent"),
        role: details.target,
        state: details.status === "queued" ? "running" : "starting",
        label: details.status === "queued" ? "message queued" : "reopened",
      }), 0, 0);
    }
    return renderToolFallback(result, theme);
  },
};

export const readToolRenderers = {
  renderCall(args: unknown, theme: UiTheme) {
    return new Text(renderToolStateRow(theme, {
      name: argText(args, "agent") || "(unknown)",
      state: "running",
      label: "read screen",
    }), 0, 0);
  },
  renderResult(result: ToolRenderResult, options: { expanded?: boolean }, theme: UiTheme) {
    const details = result.details as ToolDetails | undefined;
    if (details?.status !== "read") return renderToolFallback(result, theme);
    const lines = sanitizeDisplayText(details.screen ?? "").split("\n");
    let text = renderToolStateRow(theme, {
      name: agentLabel(details, "agent"),
      state: "completed",
      label: "read",
      metadata: `${lines.length} lines`,
    });
    if (options.expanded) {
      text += `\n${lines.map((line) => span(theme, "toolOutput", line)).join("\n")}`;
    }
    return new Text(text, 0, 0);
  },
};

export const interruptToolRenderers = {
  renderCall(args: unknown, theme: UiTheme) {
    return new Text(renderToolStateRow(theme, {
      name: argText(args, "agent") || "(unknown)",
      state: "help",
      label: "interrupt turn",
    }), 0, 0);
  },
  renderResult(result: ToolRenderResult, _options: unknown, theme: UiTheme) {
    const details = result.details as ToolDetails | undefined;
    if (details?.status === "interrupt_requested" || details?.status === "no_turn") {
      return new Text(renderToolStateRow(theme, {
        name: agentLabel(details, "agent"),
        state: details.status === "no_turn" ? "completed" : "help",
        label: details.status === "no_turn" ? "no turn runs" : "interrupt requested",
      }), 0, 0);
    }
    return renderToolFallback(result, theme);
  },
};

export const stopToolRenderers = {
  renderCall(args: unknown, theme: UiTheme) {
    return new Text(renderToolStateRow(theme, {
      name: argText(args, "agent") || "(unknown)",
      state: "running",
      label: "stop",
    }), 0, 0);
  },
  renderResult(result: ToolRenderResult, _options: unknown, theme: UiTheme) {
    const details = result.details as ToolDetails | undefined;
    if (details?.status !== "stopped") return renderToolFallback(result, theme);
    return new Text(renderToolStateRow(theme, {
      name: agentLabel(details, "agent"),
      state: "completed",
      label: "stopped",
    }), 0, 0);
  },
};

export const listToolRenderers = {
  renderResult(result: ToolRenderResult, _options: unknown, theme: UiTheme) {
    const details = result.details as ToolDetails | undefined;
    if (details?.status !== "listed") return renderToolFallback(result, theme);
    const agents = details.agents ?? [];
    if (agents.length === 0) {
      return new Text(
        `${formatState(theme, "completed", { glyphOnly: true })}${formatSeparator(theme)}${formatMetadata(theme, "No agents.")}`,
        0,
        0,
      );
    }
    const shown = new Set(panelAgents(agents).map((agent) => agent.id));
    const rows = agents.map((agent) => {
      if (!shown.has(agent.id)) {
        return renderToolStateRow(theme, {
          name: agent.name, role: agentRole(agent.agent_type, agent.target), state: "waiting", label: "stopped",
          metadata: agent.id,
        });
      }
      const presentation = STATUS_PRESENTATIONS[agent.status as Exclude<typeof agent.status, "stopped">];
      return renderToolStateRow(theme, {
        name: agent.name,
        role: agentRole(agent.agent_type, agent.target),
        state: presentation.state,
        label: presentation.label,
        metadata: agent.id,
      });
    });
    return new Text(rows.join("\n"), 0, 0);
  },
};
