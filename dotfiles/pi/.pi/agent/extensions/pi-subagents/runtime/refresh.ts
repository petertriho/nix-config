import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { readSubagentActivityFile, type ActivityReadResult, type SubagentActivityState } from "../telemetry/activity.ts";
import { advanceStatusState, forceStatusAfterInterrupt, observeStatus, type StatusConfig } from "../telemetry/status.ts";
import type { RunningSubagent } from "../execution/services.ts";
import { sendEscape } from "../adapters/tmux.ts";
import { applyWidgetMargin, createWidgetRenderer } from "../presentation/widget.ts";
import { buildStatusRefreshMessage, type StatusTransitionRecord } from "../presentation/status-message.ts";

/** One instance per index module load, shared by every registration and adapter. */
export function createSubagentRuntime(loadConfig: () => StatusConfig) {
  // Survive /reload: clear timers and abort poll loops from the previous module load.
  // /reload re-imports this file, giving fresh module-level state, but closures from
  // the old module keep running.
  // Keep these keys stable across extension directory renames.
  const WIDGET_INTERVAL_KEY = Symbol.for("pi-agent-teams/widget-interval");
  const STATUS_INTERVAL_KEY = Symbol.for("pi-agent-teams/status-interval");
  const POLL_ABORT_KEY = Symbol.for("pi-agent-teams/poll-abort-controller");

  type GlobalState = Record<symbol, unknown>;
  const globalState = globalThis as unknown as GlobalState;

  {
    const prevInterval = globalState[WIDGET_INTERVAL_KEY] as ReturnType<typeof setInterval> | undefined;
    if (prevInterval) {
      clearInterval(prevInterval);
      globalState[WIDGET_INTERVAL_KEY] = null;
    }
    const prevStatusInterval = globalState[STATUS_INTERVAL_KEY] as ReturnType<typeof setInterval> | undefined;
    if (prevStatusInterval) {
      clearInterval(prevStatusInterval);
      globalState[STATUS_INTERVAL_KEY] = null;
    }
    rearmModuleAbortController();
  }

  /**
   * Abort any poll loops from the previous module load or session, then install a
   * fresh module abort controller.
   *
   * `session_shutdown` aborts the controller, but `/new`, `/resume`, and `/fork`
   * rebind the cached extension instance without re-importing this module, so
   * only `session_start` can re-arm it. Without the re-arm, every subagent spawn
   * in the new session fails instantly with "Aborted while waiting for subagent
   * to finish".
   */
  function rearmModuleAbortController(): void {
    const prevAbort = globalState[POLL_ABORT_KEY] as AbortController | undefined;
    if (prevAbort) prevAbort.abort();
    globalState[POLL_ABORT_KEY] = new AbortController();
  }

  function getModuleAbortSignal(): AbortSignal {
    return (globalState[POLL_ABORT_KEY] as AbortController).signal;
  }
  const statusConfig = loadConfig();
  const renderSubagentWidgetLines = createWidgetRenderer(statusConfig);
  const runningSubagents = new Map<string, RunningSubagent>();

  let latestCtx: ExtensionContext | null = null;

  let widgetInterval: ReturnType<typeof setInterval> | null = null;

  let statusInterval: ReturnType<typeof setInterval> | null = null;

  function updateWidget() {
    // Clear the refresh interval even in headless contexts (no UI yet); the
    // repeating timer otherwise keeps the event loop alive forever once the
    // last subagent entry is gone.
    if (runningSubagents.size === 0) {
      if (latestCtx?.hasUI) latestCtx.ui.setWidget("subagent-status", undefined);
      if (widgetInterval) {
        clearInterval(widgetInterval);
        widgetInterval = null;
        globalState[WIDGET_INTERVAL_KEY] = null;
      }
      return;
    }

    if (!latestCtx?.hasUI) return;

    latestCtx.ui.setWidget(
      "subagent-status",
      (_tui, theme) => {
        return {
          invalidate() {},
          render(width: number) {
            const boxLines = renderSubagentWidgetLines(
              theme,
              Array.from(runningSubagents.values()),
              Math.max(0, width - 2),
            );
            return applyWidgetMargin(boxLines, width);
          },
        };
      },
      { placement: "aboveEditor" },
    );
  }

  function activityLabel(activity: SubagentActivityState): string | undefined {
    if (activity.phase !== "active") return undefined;
    if (activity.activeScope === "tool") return activity.toolName ?? "tool";
    if (activity.activeScope === "provider") return "provider";
    if (activity.activeScope === "streaming") return "streaming";
    return activity.activeScope;
  }

  function observeRunningSubagent(running: RunningSubagent, observedAt = Date.now()) {
    if (running.cli === "claude") return;

    const activityFile = running.activityFile;
    const read: ActivityReadResult = activityFile
      ? readSubagentActivityFile(activityFile, running.id)
      : { ok: false, reason: "missing" };

    running.activityRead = read.ok
      ? { ok: true }
      : { ok: false, reason: read.reason, error: read.error };

    if (read.ok) {
      running.activity = read.activity;
      running.statusState = observeStatus(running.statusState, {
        snapshot: "present",
        updatedAt: read.activity.updatedAt,
        sequence: read.activity.sequence,
        phase: read.activity.phase,
        active: read.activity.phase === "active",
        activeScope: read.activity.activeScope,
        activeSince: read.activity.activeSince,
        waitingSince: read.activity.waitingSince,
        latestEvent: read.activity.latestEvent,
        activityLabel: activityLabel(read.activity),
      }, observedAt);
      return;
    }

    running.statusState = observeStatus(running.statusState, {
      snapshot: read.reason,
      snapshotError: read.error,
    }, observedAt);
  }

  function resolveByName(requestedName: string): { running: RunningSubagent } | { error: string } | null {
    const matches = Array.from(runningSubagents.values()).filter((running) => running.name === requestedName);
    if (matches.length === 1) return { running: matches[0] };
    if (matches.length === 0) return null;
    const candidates = matches.map((running) => `${running.name} [${running.id}]`).join(", ");
    return { error: `Ambiguous subagent name "${requestedName}". Matches: ${candidates}` };
  }

  function resolveInterruptTarget(params: { id?: string; name?: string }):
    | { running: RunningSubagent }
    | { error: string } {
    const requestedId = params.id?.trim();
    if (requestedId) {
      const running = runningSubagents.get(requestedId);
      if (running) return { running };
      // Models often put the display name into `id`. Accept it when it is unambiguous.
      const byName = resolveByName(requestedId);
      if (byName) return byName;
      return { error: `No running subagent with id "${requestedId}".` };
    }

    const requestedName = params.name?.trim();
    if (!requestedName) {
      return { error: "Provide a running subagent id or exact display name." };
    }

    return resolveByName(requestedName) ?? { error: `No running subagent named "${requestedName}".` };
  }

  function requestSubagentInterrupt(
    running: RunningSubagent,
    sendEscapeKey: (surface: string) => void = sendEscape,
  ): { ok: true } | { error: string } {
    try {
      sendEscapeKey(running.surface);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        error: `Failed to send Escape to subagent "${running.name}" via tmux: ${message}`,
      };
    }
  }

  interface InterruptToolResult {
    isError?: boolean;
    content: Array<{ type: "text"; text: string }>;
    details: { error?: string; id?: string; name?: string; status?: string };
  }

  function handleSubagentInterrupt(
    params: { id?: string; name?: string },
    sendEscapeKey: (surface: string) => void = sendEscape,
  ): InterruptToolResult {
    const resolved = resolveInterruptTarget(params);
    if ("error" in resolved) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: resolved.error }],
        details: { error: resolved.error },
      };
    }

    const running = resolved.running;
    if (running.cli === "claude") {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text:
            "Turn-only Escape interrupt is currently supported only for Pi-backed subagents. Claude-backed semantics have not been verified yet.",
        }],
        details: { error: "claude interrupt unsupported", id: running.id, name: running.name },
      };
    }

    const now = Date.now();
    observeRunningSubagent(running, now);

    const interruption = requestSubagentInterrupt(running, sendEscapeKey);
    if ("error" in interruption) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: interruption.error }],
        details: { error: interruption.error, id: running.id, name: running.name },
      };
    }

    running.statusState = forceStatusAfterInterrupt(running.statusState, now);
    updateWidget();

    return {
      content: [{ type: "text" as const, text: `Interrupt requested for subagent "${running.name}".` }],
      details: { id: running.id, name: running.name, status: "interrupt_requested" },
    };
  }

  function startStatusRefresh(pi: ExtensionAPI) {
    if (!statusConfig.enabled || statusInterval) return;

    statusInterval = setInterval(() => {
      if (runningSubagents.size === 0) {
        if (statusInterval) {
          clearInterval(statusInterval);
          statusInterval = null;
          globalState[STATUS_INTERVAL_KEY] = null;
        }
        return;
      }

      const transitions: StatusTransitionRecord[] = [];
      const now = Date.now();
      let shouldRefreshWidget = false;

      for (const running of runningSubagents.values()) {
        observeRunningSubagent(running, now);
        const { nextState, snapshot, transition } = advanceStatusState(running.statusState, now);
        if (nextState.currentKind !== running.statusState.currentKind) {
          shouldRefreshWidget = true;
        }
        running.statusState = nextState;

        // A user-driven pane must not wake the parent on status transitions.
        if (transition && !running.interactive) {
          transitions.push({ name: running.name, snapshot, transition });
        }
      }

      if (shouldRefreshWidget) updateWidget();

      if (transitions.length > 0) {
        const statusMessage = buildStatusRefreshMessage(transitions, statusConfig.lineLimit);
        pi.sendMessage(
          {
            customType: "subagent_status",
            content: statusMessage.content,
            display: true,
            details: statusMessage.details,
          },
          { triggerTurn: true, deliverAs: "steer" },
        );
      }
    }, 1000);

    globalState[STATUS_INTERVAL_KEY] = statusInterval;
  }

  function startWidgetRefresh() {
    if (widgetInterval) return;
    updateWidget();
    widgetInterval = setInterval(() => {
      updateWidget();
    }, 1000);
    globalState[WIDGET_INTERVAL_KEY] = widgetInterval;
  }
  function stopRefresh(): void {
    if (widgetInterval) {
      clearInterval(widgetInterval);
      widgetInterval = null;
      globalState[WIDGET_INTERVAL_KEY] = null;
    }
    if (statusInterval) {
      clearInterval(statusInterval);
      statusInterval = null;
      globalState[STATUS_INTERVAL_KEY] = null;
    }
  }

  function abortPolling(): void {
    const moduleAbort = globalState[POLL_ABORT_KEY] as AbortController | undefined;
    if (moduleAbort) moduleAbort.abort();
    for (const agent of runningSubagents.values()) {
      agent.abortController?.abort();
    }
  }

  return {
    runningSubagents, renderSubagentWidgetLines,
    rearmModuleAbortController, getModuleAbortSignal,
    observeRunningSubagent, resolveInterruptTarget,
    requestSubagentInterrupt, handleSubagentInterrupt,
    startWidgetRefresh, startStatusRefresh, updateWidget,
    stopRefresh, abortPolling,
    setContext(ctx: ExtensionContext) { latestCtx = ctx; },
  };
}
export type SubagentRuntime = ReturnType<typeof createSubagentRuntime>;
