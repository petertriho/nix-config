import type { ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import type { SubagentParamsType } from "../registration/schemas.ts";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import type { SubagentRuntime } from "./refresh.ts";
import type { ExecutionRuntime } from "./execution.ts";
import type { OrdinaryTool } from "./ordinary-agents.ts";
import type { SessionState, OrdinaryFollowUp } from "./session-state.ts";
import { activeAgentResult } from "./tool-results.ts";

export function createNamedFollowUp(
  pi: ExtensionAPI,
  discovery: AgentDiscovery,
  runtime: SubagentRuntime,
  execution: ExecutionRuntime,
  ordinaryTool: OrdinaryTool,
  session: SessionState
) {
  const { loadAgentDefaults } = discovery;
  const { runningSubagents } = runtime;
  const { subagentExecution } = execution;
  const { finishedOrdinary, followUpsInFlight } = session;
  return async function followUp(
    _toolCallId: string,
    params: { recipient: string; content: string },
    _signal: AbortSignal | undefined,
    _onUpdate: Parameters<OrdinaryTool["execute"]>[3],
    ctx: ExtensionToolContext
  ) {
    const recipient = params.recipient.trim();
    const fail = (error: string) => ({
      isError: true,
      content: [{ type: "text" as const, text: `Error: ${error}` }],
      details: { error },
    });
    if (followUpsInFlight.has(recipient)) return fail(`A follow-up to "${recipient}" is already running.`);
    if ([...runningSubagents.values()].some((running) => running.name === recipient)) {
      return fail(`Agent "${recipient}" is still running; wait for its completion before a saved-session follow-up.`);
    }
    const saved = finishedOrdinary.get(recipient);
    if (!saved) return fail(`No finished ordinary named agent "${recipient}" in this session.`);
    if (saved.backend === "claude" &&
        (!saved.launch.agent || loadAgentDefaults(saved.launch.agent)?.cli !== "claude")) {
      return fail(`The saved Claude agent definition "${saved.launch.agent}" is no longer available as a Claude CLI agent.`);
    }
    followUpsInFlight.add(recipient);
    finishedOrdinary.delete(recipient);
    const launchEpoch = session.sessionEpoch;
    const isOwned = () => session.sessionActive && session.sessionEpoch === launchEpoch;
    const onResult = () => {
      if (isOwned()) followUpsInFlight.delete(recipient);
    };
    const restore = () => {
      if (!isOwned()) return;
      followUpsInFlight.delete(recipient);
      finishedOrdinary.set(recipient, saved);
    };
    try {
      const response = saved.backend === "claude"
        ? await ordinaryTool.execute(_toolCallId, {
          ...saved.launch, name: recipient, task: params.content, resumeSessionId: saved.claudeSessionId,
          followUpName: recipient, followUpLifecycle: { onResult, onError: restore },
        } satisfies SubagentParamsType & OrdinaryFollowUp, _signal, _onUpdate, ctx)
        : await subagentExecution.executeSubagentResume(
          pi, { sessionPath: saved.sessionPath, name: recipient, message: params.content },
          ctx, undefined, {
            isOwned,
            signal: _signal,
            onResult: ({ result }) => {
              if (!isOwned()) return;
              if (result.exitCode === 0 && !result.error && !result.errorMessage && result.sessionFile) {
                onResult();
                finishedOrdinary.set(recipient, { backend: "pi", id: saved.id, sessionPath: result.sessionFile });
              } else {
                restore();
              }
            },
            onError: restore,
          },
        );
      const details = response.details as { status?: string } | undefined;
      if (details?.status !== "started") restore();
      return activeAgentResult(response);
    } catch (error) {
      restore();
      throw error;
    }
  };
}
export type NamedFollowUp = ReturnType<typeof createNamedFollowUp>;
