import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isTmuxAvailable } from "../adapters/tmux.ts";
import { attachTmuxWorkflowProvider, tmuxWorkflowProviderIO } from "../adapters/workflow-provider.ts";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import type { SubagentRuntime } from "./refresh.ts";
import type { ExecutionRuntime } from "./execution.ts";

export function createWorkflowAdapter(discovery: AgentDiscovery, runtime: SubagentRuntime, execution: ExecutionRuntime) {
  const { getAgentConfigDir, getBundledAgentsDir, parseAgentDefinition } = discovery;
  const { startWidgetRefresh, startStatusRefresh, updateWidget } = runtime;
  const { subagentExecution } = execution;
  let attachedWorkflowProvider: ReturnType<typeof attachTmuxWorkflowProvider> = null;

  function attachWorkflowProvider(pi: ExtensionAPI, ctx: ExtensionContext): void {
    if (attachedWorkflowProvider || !pi.events || !isTmuxAvailable()
      || process.env.PI_SUBAGENT_ID || process.env.PI_SUBAGENT_SESSION
      || !ctx.sessionManager.getSessionFile()) return;
    const io = tmuxWorkflowProviderIO();
    const attached = attachTmuxWorkflowProvider({
      events: pi.events,
      sessionId: ctx.sessionManager.getSessionId(),
      env: process.env,
      isAvailable: isTmuxAvailable,
      resolveProfile(agentId) {
        // Match the ordinary spawn lookup, including project > global > bundled.
        const paths = [
          join(process.cwd(), ".pi", "agents", `${agentId}.md`),
          join(getAgentConfigDir(), "agents", `${agentId}.md`),
          join(getBundledAgentsDir(), `${agentId}.md`),
        ];
        for (const path of paths) {
          if (!existsSync(path)) continue;
          const contents = readFileSync(path, "utf8");
          const definition = parseAgentDefinition(contents, agentId);
          // Workflow inspection and resume require Pi session/model facts. Reject
          // unsupported overrides instead of falling back to a lower-priority file.
          if (definition?.cli && definition.cli !== "pi") {
            throw new Error(
              `Workflow agent profile "${agentId}" uses unsupported CLI "${definition.cli}"; workflow roles require the Pi runtime.`,
            );
          }
          if (definition?.body) return io.resolveFile(agentId, path, definition.body);
        }
        return null;
      },
      readProfile: io.readProfile,
      updateProfile: io.updateProfile,
      recordLaunchedModel: io.recordLaunchedModel,
      estimateContext: io.estimateContext,
      checkRepository: io.checkRepository,
      services: subagentExecution,
      refresh: {
        start() {
          startWidgetRefresh();
          startStatusRefresh(pi);
        },
        update: updateWidget,
      },
      ctx: { ...ctx, pi },
      pi,
    });
    if (attached) attachedWorkflowProvider = attached;
  }

  function shutdownWorkflowProvider(): void {
    attachedWorkflowProvider?.detach();
    attachedWorkflowProvider = null;
  }
  return { attachWorkflowProvider, shutdownWorkflowProvider };
}
export type WorkflowAdapter = ReturnType<typeof createWorkflowAdapter>;
