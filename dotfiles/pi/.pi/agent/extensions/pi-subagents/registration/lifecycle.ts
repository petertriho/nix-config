import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SubagentRuntime } from "../runtime/refresh.ts";
import type { SessionState } from "../runtime/session-state.ts";
import type { TeamRuntime } from "../runtime/teams.ts";
import type { TaskRpcAdapter } from "../runtime/task-rpc.ts";
import type { WorkflowAdapter } from "../runtime/workflow-adapter.ts";

/** Preserve start/shutdown ordering across all owners of this extension instance. */
export function registerSessionLifecycle(
  pi: ExtensionAPI,
  runtime: SubagentRuntime,
  session: SessionState,
  team: TeamRuntime,
  tasks: TaskRpcAdapter,
  workflow: WorkflowAdapter
): void {
  const { finishedOrdinary, followUpsInFlight } = session;
  const { runningSubagents, rearmModuleAbortController } = runtime;
  const { attachPiTasksRpcBridge, shutdownPiTasksRpcBridge } = tasks;
  const { attachWorkflowProvider, shutdownWorkflowProvider } = workflow;
  pi.on("session_start", (event, ctx) => {
    session.sessionActive = true;
    if (event.reason === "new" || event.reason === "resume" || event.reason === "fork") {
      session.sessionEpoch++;
      finishedOrdinary.clear();
      followUpsInFlight.clear();
    }
    runtime.setContext(ctx);
    team.recordSessionStart(event.reason, ctx);
    // Session navigation reuses this module; re-arm the controller aborted by
    // session_shutdown before starting a new watcher.
    rearmModuleAbortController();
    attachWorkflowProvider(pi, ctx);
    void attachPiTasksRpcBridge(pi, ctx).catch(() => {
      // Provider probing or registration failed; the bridge stays absent and
      // pi-tasks reports task execution as unavailable.
    });
  });

  pi.on("session_shutdown", () => {
    team.shutdown();
    session.sessionEpoch++;
    session.sessionActive = false;
    finishedOrdinary.clear();
    followUpsInFlight.clear();
    shutdownWorkflowProvider();
    runtime.stopRefresh();
    runtime.abortPolling();
    // Task panes never survive the parent session: unsubscribe the handlers,
    // terminate adapter-owned panes, and clear the task-run records.
    shutdownPiTasksRpcBridge();
    runningSubagents.clear();
  });
}
