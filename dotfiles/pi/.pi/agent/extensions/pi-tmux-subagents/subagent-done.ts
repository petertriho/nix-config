/**
 * Child-side extension for pi-tmux-subagents, loaded into every child pi with `-e`.
 * Ported from upstream pi-interactive-subagents `subagent-done.ts`.
 * - Shows agent identity + available tools as a styled widget above the editor (toggle with Ctrl+Shift+J; Ctrl+J is pi's built-in newline and bare Alt+J is swallowed by niri)
 * - Provides `subagent_done` and `caller_ping` tools and auto-exit on `agent_end`
 * - Records activity snapshots for the parent's status watcher
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { writeFileSync } from "node:fs";
import { createSubagentActivityRecorder } from "./activity.ts";
import {
  applyPanelMargin,
  chooseWidthCandidate,
  formatKeyHint,
  formatMetadata,
  formatSeparator,
  renderPanelBottom,
  renderPanelRow,
  renderPanelTop,
  sanitizeDisplayLine,
  span,
  type UiTheme,
} from "./ui.ts";

export function shouldMarkUserTookOver(agentStarted: boolean): boolean {
  return agentStarted;
}

export function shouldAutoExitOnAgentEnd(
  _userTookOver: boolean,
  messages: any[] | undefined,
): boolean {
  // Manual input should not strand an auto-exit subagent. If the latest agent
  // turn completed normally, close the session. Escape/abort still leaves it
  // open for inspection or another prompt.
  //
  // stopReason: "error" (e.g. exhausted retries on a provider overload) also
  // returns true — we want to shut down so the parent is woken up — but we
  // pair this with findLatestAssistantError() so the parent learns it was an
  // error, not a clean completion.
  if (messages) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.role === "assistant") {
        return msg.stopReason !== "aborted";
      }
    }
  }

  return true;
}

export interface SubagentErrorInfo {
  errorMessage: string;
  stopReason: "error";
}

/**
 * If the last assistant message in the turn ended with `stopReason: "error"`
 * (typically auto-retry exhausted on an overload / rate limit / server error),
 * return its error info so the parent orchestrator can surface a clear
 * failure instead of silently treating the run as completed.
 *
 * Returns `null` when the latest assistant turn completed normally or was
 * aborted by the user (handled separately by shouldAutoExitOnAgentEnd).
 */
export function findLatestAssistantError(
  messages: any[] | undefined,
): SubagentErrorInfo | null {
  if (!messages) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "assistant") continue;
    if (msg.stopReason !== "error") return null;
    const raw = typeof msg.errorMessage === "string" ? msg.errorMessage.trim() : "";
    return {
      errorMessage: raw || "Subagent agent loop ended with stopReason=error (no errorMessage field).",
      stopReason: "error",
    };
  }
  return null;
}

export function parseDeniedTools(rawValue: string | undefined): string[] {
  return (rawValue ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export interface SubagentToolsWidgetData {
  identity: string;
  toolNames: string[];
  denied: string[];
  expanded: boolean;
}

function wrapWidgetRow(text: string, width: number): string[] {
  if (width <= 0) return [];
  return wrapTextWithAnsi(text, width);
}

export function renderSubagentToolsWidget(
  theme: UiTheme,
  data: SubagentToolsWidgetData,
  width: number,
): string[] {
  const safeWidth = Number.isFinite(width)
    ? Math.max(0, Math.floor(width))
    : 0;
  const panelWidth = Math.max(0, safeWidth - 2);
  const contentWidth = Math.max(0, panelWidth - 2);
  const identity = sanitizeDisplayLine(data.identity) || "Subagent";
  const toolNames = data.toolNames.map(sanitizeDisplayLine).filter(Boolean);
  const denied = data.denied.map(sanitizeDisplayLine).filter(Boolean);
  const lines = [
    renderPanelTop(
      theme,
      panelWidth,
      identity,
      `${toolNames.length} available`,
    ),
  ];

  if (data.expanded) {
    const availableList = toolNames
      .map((name) => span(theme, "dim", name))
      .join(span(theme, "dim", ", "));
    const availableText = `${formatMetadata(theme, "available:")}${
      availableList ? ` ${availableList}` : ""
    }`;
    for (const line of wrapWidgetRow(availableText, contentWidth)) {
      lines.push(renderPanelRow(theme, panelWidth, line));
    }

    if (denied.length > 0) {
      const deniedList = denied
        .map((name) => span(theme, "warning", name))
        .join(span(theme, "dim", ", "));
      const deniedText =
        `${span(theme, "warning", "denied:")} ${deniedList}`;
      for (const line of wrapWidgetRow(deniedText, contentWidth)) {
        lines.push(renderPanelRow(theme, panelWidth, line));
      }
    }

    const collapseHint = formatKeyHint(theme, "Ctrl+Shift+J", "collapse");
    for (const line of wrapWidgetRow(collapseHint, contentWidth)) {
      lines.push(renderPanelRow(theme, panelWidth, line));
    }
  } else {
    const expandHint = formatKeyHint(theme, "Ctrl+Shift+J", "expand");
    const deniedInfo = denied.length > 0
      ? span(theme, "warning", `${denied.length} denied`)
      : "";
    const full = deniedInfo
      ? `${deniedInfo}${formatSeparator(theme)}${expandHint}`
      : expandHint;
    const content = chooseWidthCandidate(
      deniedInfo ? [full, deniedInfo, expandHint] : [expandHint],
      contentWidth,
    );
    lines.push(renderPanelRow(theme, panelWidth, content));
  }

  lines.push(renderPanelBottom(theme, panelWidth));
  return applyPanelMargin(lines, safeWidth);
}

export default function subagentDone(pi: ExtensionAPI) {
  let toolNames: string[] = [];
  let denied: string[] = [];
  let expanded = false;

  // Read subagent identity from env vars (set by parent orchestrator)
  const subagentName = process.env.PI_SUBAGENT_NAME ?? "";
  const subagentAgent = process.env.PI_SUBAGENT_AGENT ?? "";
  const deniedToolsValue = process.env.PI_DENY_TOOLS;
  const autoExit = process.env.PI_SUBAGENT_AUTO_EXIT === "1";
  const recorder = createSubagentActivityRecorder({
    runningChildId: process.env.PI_SUBAGENT_ID,
    activityFile: process.env.PI_SUBAGENT_ACTIVITY_FILE,
  });

  function renderWidget(ctx: Pick<ExtensionContext, "ui">) {
    ctx.ui.setWidget(
      "subagent-tools",
      (_tui, theme) => {
        return {
          invalidate() {},
          render(width: number) {
            return renderSubagentToolsWidget(
              theme,
              {
                identity: subagentAgent || subagentName,
                toolNames,
                denied,
                expanded,
              },
              width,
            );
          },
        };
      },
      { placement: "aboveEditor" },
    );
  }

  let userTookOver = false;
  let agentStarted = false;

  // Show widget + status bar on session start
  pi.on("session_start", (_event, ctx) => {
    recorder.sessionStart();
    const tools = pi.getAllTools();
    toolNames = tools.map((t) => t.name).sort();
    denied = parseDeniedTools(deniedToolsValue);

    renderWidget(ctx);
  });

  pi.on("input", () => {
    recorder.input();
    // Ignore the initial task message that starts an autonomous subagent.
    // Only inputs after the first agent run has started count as user takeover.
    if (!shouldMarkUserTookOver(agentStarted)) return;
    userTookOver = true;
  });

  pi.on("before_agent_start", () => {
    recorder.beforeAgentStart();
  });

  pi.on("agent_start", () => {
    agentStarted = true;
    recorder.agentStart();
  });

  pi.on("agent_end", (event, ctx) => {
    const messages = (event as any).messages as any[] | undefined;
    const shouldExit = autoExit && shouldAutoExitOnAgentEnd(userTookOver, messages);

    if (shouldExit) {
      // Surface stopReason: "error" turns (auto-retry exhausted, provider
      // overload, etc.) to the parent via the .exit sidecar so the watcher
      // can report a clear failure with the underlying error message.
      // Without this the parent would only see exit code 0 and a stale
      // assistant message, mistaking the crash for a successful completion.
      const errorInfo = findLatestAssistantError(messages);
      const sessionFile = process.env.PI_SUBAGENT_SESSION;
      if (errorInfo && sessionFile) {
        try {
          writeFileSync(
            `${sessionFile}.exit`,
            JSON.stringify({
              type: "error",
              errorMessage: errorInfo.errorMessage,
              stopReason: errorInfo.stopReason,
            }),
          );
        } catch {
          // Best effort — even without the sidecar, watcher's session-file
          // fallback can still recover the errorMessage.
        }
      }

      recorder.agentEndDone();
      ctx.shutdown();
      return;
    }

    recorder.agentEndWaiting();
    if (autoExit) {
      // Reset any recorded manual input marker. Auto-exit is decided by whether
      // the latest agent turn completed normally, not by who initiated it.
      userTookOver = false;
    }
  });

  pi.on("turn_start", (event) => {
    recorder.turnStart((event as any).turnIndex);
  });

  pi.on("turn_end", (event) => {
    recorder.turnEnd((event as any).turnIndex);
  });

  pi.on("before_provider_request", () => {
    recorder.beforeProviderRequest();
  });

  pi.on("after_provider_response", () => {
    recorder.afterProviderResponse();
  });

  pi.on("message_update", (event) => {
    recorder.messageUpdate((event as any).assistantMessageEvent?.type);
  });

  pi.on("tool_execution_start", (event) => {
    recorder.toolExecutionStart((event as any).toolCallId, (event as any).toolName);
  });

  pi.on("tool_call", (event) => {
    recorder.toolCall((event as any).toolCallId, (event as any).toolName);
  });

  pi.on("tool_execution_update", (event) => {
    recorder.toolExecutionUpdate((event as any).toolCallId, (event as any).toolName);
  });

  pi.on("tool_result", (event) => {
    recorder.toolResult((event as any).toolCallId, (event as any).toolName);
  });

  pi.on("tool_execution_end", (event) => {
    recorder.toolExecutionEnd((event as any).toolCallId, (event as any).toolName);
  });

  pi.on("session_shutdown", (event) => {
    recorder.sessionShutdown((event as any).reason);
  });

  // Toggle expand/collapse with Ctrl+Shift+J (bare Alt+J is consumed by the
  // compositor in niri setups and never reaches the terminal).
  pi.registerShortcut("ctrl+shift+j", {
    description: "Toggle subagent tools widget",
    handler: (ctx) => {
      expanded = !expanded;
      renderWidget(ctx);
    },
  });

  pi.registerTool({
    name: "caller_ping",
    label: "Caller Ping",
    description:
      "Send a help request to the parent agent and exit this session. " +
      "The parent will be notified with your message and can resume this session with a response. " +
      "Use when you're stuck, need clarification, or need the parent to take action.",
    parameters: Type.Object({
      message: Type.String({ description: "What you need help with" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const sessionFile = process.env.PI_SUBAGENT_SESSION;
      if (!sessionFile) {
        throw new Error(
          "caller_ping is only available in subagent contexts. " +
            "PI_SUBAGENT_SESSION environment variable is not set.",
        );
      }

      recorder.callerPing();
      const exitData = {
        type: "ping" as const,
        name: process.env.PI_SUBAGENT_NAME ?? "subagent",
        message: params.message,
      };
      writeFileSync(`${sessionFile}.exit`, JSON.stringify(exitData));

      ctx.shutdown();
      return {
        content: [{ type: "text", text: "Ping sent. Session will exit and parent will be notified." }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "subagent_done",
    label: "Subagent Done",
    description:
      "Call this tool when you have completed your task. " +
      "It will close this session and return your results to the main session. " +
      "Your LAST assistant message before calling this becomes the summary returned to the caller.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const sessionFile = process.env.PI_SUBAGENT_SESSION;
      recorder.subagentDone();
      if (sessionFile) {
        writeFileSync(`${sessionFile}.exit`, JSON.stringify({ type: "done" }));
      }
      ctx.shutdown();
      return {
        content: [{ type: "text", text: "Shutting down subagent session." }],
        details: {},
      };
    },
  });
}
