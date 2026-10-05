import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { allocateAgentWorktree, releaseUnusedWorktree, type OwnedWorktree } from "../execution/worktree.ts";
import { readAgentModelConfig } from "../profiles/agent-models.ts";
import { resolveModelPolicy, resolveConfiguredAgentModel, type ResolvedModelSelection } from "../profiles/model-picker.ts";
import { classifyProviderFailure } from "../execution/provider-failure.ts";
import { resolveResultPresentation, resolveUsageDetails, type RunningSubagent, type SubagentResult } from "../execution/services.ts";
import { isTmuxAvailable } from "../adapters/tmux.ts";
import { SubagentParams, normalizeSubagentParams, type SubagentParamsType } from "../registration/schemas.ts";
import { SUBAGENT_TOOL_DESCRIPTION } from "../registration/descriptions.ts";
import { ordinaryToolRenderers } from "../presentation/tool-renderers.ts";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import type { ExecutionRuntime } from "./execution.ts";
import { muxUnavailableResult } from "./execution.ts";
import type { SessionState, OrdinaryFollowUp } from "./session-state.ts";

export function createOrdinaryTool(pi: ExtensionAPI, discovery: AgentDiscovery, execution: ExecutionRuntime, session: SessionState) {
  const { loadAgentDefaults, resolveSubagentPaths } = discovery;
  const { subagentExecution, launchSubagent, watchSubagent } = execution;
  const { finishedOrdinary } = session;
  const ordinaryTool = defineTool({
    name: "subagent",
    label: "Subagent",
    description: SUBAGENT_TOOL_DESCRIPTION,
    promptSnippet: SUBAGENT_TOOL_DESCRIPTION,
    parameters: SubagentParams,

    async execute(_toolCallId, rawParams, signal, _onUpdate, ctx) {
      const params = normalizeSubagentParams(rawParams);
      const { followUpName, followUpLifecycle } = rawParams as SubagentParamsType & OrdinaryFollowUp;
      const launchEpoch = session.sessionEpoch;
      // Prevent self-spawning (e.g. executor spawning another executor).
      const currentAgent = process.env.PI_SUBAGENT_AGENT;
      if (params.agent && currentAgent && params.agent === currentAgent) {
        return {
          content: [
            {
              type: "text",
              text: `You are the ${currentAgent} agent — do not start another ${currentAgent}. You were spawned to do this work yourself. Complete the task directly.`,
            },
          ],
          details: { error: "self-spawn blocked" },
        };
      }

      let resolvedModel: ResolvedModelSelection | undefined;
      const spawnAgentDefs = params.agent ? loadAgentDefaults(params.agent) : null;
      if (params.model) {
        try {
          const resolution = await resolveModelPolicy(params.model, ctx, {
            mode: "spawn",
            agentModel: spawnAgentDefs?.model,
            agentThinking: spawnAgentDefs?.thinking,
          });
          if (resolution.source !== "legacy") resolvedModel = resolution;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: `Error: ${message}` }],
            details: { error: "model selection failed", message },
          };
        }
      } else if (params.agent && !spawnAgentDefs?.cli) {
        // Per-agent configured default from <agentDir>/agent-models.json.
        // Applies to every fresh spawn the workflow gate above does not
        // intercept; `cli:` agents keep frontmatter and agent-less spawns
        // keep the parent model. Precedence when omitted: config entry >
        // agent frontmatter `model:` > parent session model. Malformed or
        // unresolvable entries hard-error instead of falling back.
        const agentModels = readAgentModelConfig();
        if (agentModels.status === "invalid") {
          const message = agentModels.error;
          return {
            content: [{
              type: "text",
              text: `Error: ${message} Fix or remove the file, or run /agent-models, before spawning ${params.agent}.`,
            }],
            details: { error: "agent model config invalid", message },
          };
        }
        const configured = agentModels.status === "ok"
          ? agentModels.config.agents[params.agent]
          : undefined;
        if (configured) {
          try {
            resolvedModel = resolveConfiguredAgentModel(configured, ctx, params.agent);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              content: [{
                type: "text",
                text: `Error: ${message} Edit ${agentModels.path} or run /agent-models to fix the entry.`,
              }],
              details: { error: "agent model config resolution failed", message },
            };
          }
        }
      }

      if (!isTmuxAvailable()) {
        return muxUnavailableResult();
      }

      if (!ctx.sessionManager.getSessionFile()) {
        return {
          content: [
            {
              type: "text",
              text: "Error: no session file. Start pi with a persistent session to use subagents.",
            },
          ],
          details: { error: "no session file" },
        };
      }

      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: "Sub-agent launch cancelled." }],
          details: { error: "cancelled" },
        };
      }
      let ownedWorktree: OwnedWorktree | undefined;
      if ((rawParams as SubagentParamsType & { isolation?: string }).isolation === "worktree") {
        try {
          const sourceCwd = resolveSubagentPaths(params, spawnAgentDefs).effectiveCwd ?? ctx.cwd;
          ownedWorktree = allocateAgentWorktree(sourceCwd);
          params.cwd = ownedWorktree.cwd;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: `Error: ${message}` }],
            details: { error: "worktree allocation failed", message },
          };
        }
      }
      const launchCwd = resolveSubagentPaths(params, spawnAgentDefs).effectiveCwd ?? ctx.cwd;
      let running: RunningSubagent;
      try {
        running = await launchSubagent(
          params,
          { ...ctx, pi },
          {
            ...(resolvedModel ? { resolvedModel } : {}),
            ...((rawParams as SubagentParamsType & { maxTurns?: number }).maxTurns
              ? { taskRuntime: { maxTurns: (rawParams as SubagentParamsType & { maxTurns: number }).maxTurns } }
              : {}),
          },
        );
      } catch (error) {
        if (ownedWorktree) {
          releaseUnusedWorktree(ownedWorktree);
          if (existsSync(ownedWorktree.path)) {
            throw new Error(
              `Agent launch failed; isolated worktree retained at ${ownedWorktree.path}: ${error instanceof Error ? error.message : String(error)}`,
              { cause: error },
            );
          }
        }
        throw error;
      }
      if (!session.sessionActive || session.sessionEpoch !== launchEpoch) {
        subagentExecution.stopSubagent(running);
        throw new Error("Agent launch interrupted by session navigation; the child was stopped.");
      }

      const rememberFinished = (result: SubagentResult): void => {
        if (!session.sessionActive || session.sessionEpoch !== launchEpoch) return;
        followUpLifecycle?.onResult();
        if (!followUpName || result.exitCode !== 0 || result.error) return;
        if (running.cli === "claude") {
          // The generated Pi sidecar path is not a Claude resume reference.
          if (!result.claudeSessionId) return;
          finishedOrdinary.set(followUpName, {
            backend: "claude", id: running.id, claudeSessionId: result.claudeSessionId,
            launch: {
              agent: params.agent,
              cwd: launchCwd,
              model: params.model,
              systemPrompt: params.systemPrompt,
              interactive: params.interactive,
            },
          });
        } else if (result.sessionFile) {
          finishedOrdinary.set(followUpName, { backend: "pi", id: running.id, sessionPath: result.sessionFile });
        }
      };

      if ((rawParams as SubagentParamsType & { runInForeground?: boolean }).runInForeground) {
        const result = await watchSubagent(running, signal ?? new AbortController().signal);
        rememberFinished(result);
        const usage = resolveUsageDetails(result, ctx);
        return {
          content: [{ type: "text", text: resolveResultPresentation(
            { ...result, ...(usage ? { usage } : {}) }, running.name,
          ) }],
          details: {
            id: running.id, name: running.name, task: running.task, agent: running.agent,
            exitCode: result.exitCode, elapsed: result.elapsed, sessionFile: result.sessionFile,
            ...(ownedWorktree ? { worktreePath: ownedWorktree.path } : {}),
            ...(result.error ? { error: result.error } : {}),
            ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
            ...(usage ? { usage } : {}),
            ...(result.claudeSessionId ? { claudeSessionId: result.claudeSessionId } : {}),
          },
        };
      }
      subagentExecution.watchInBackground({
        pi,
        ctx,
        running,
        isOwned: () => session.sessionActive && session.sessionEpoch === launchEpoch,
        pingAgent: running.agent,
        pingSessionPath: running.cli === "claude" ? undefined : running.sessionFile,
        onSuccess: ({ result }) => {
          rememberFinished(result);
          const usage = resolveUsageDetails(result, ctx);
          const base = resolveResultPresentation(
            { ...result, ...(usage ? { usage } : {}) },
            running.name,
          );
          return {
            content: base,
            details: {
              id: running.id,
              name: running.name,
              task: running.task,
              agent: running.agent,
              exitCode: result.exitCode,
              elapsed: result.elapsed,
              sessionFile: result.sessionFile,
              ...(ownedWorktree ? { worktreePath: ownedWorktree.path } : {}),
              ...(result.errorMessage
                ? {
                  errorMessage: result.errorMessage,
                  failureKind: classifyProviderFailure(result.errorMessage),
                }
                : {}),
              ...(usage ? { usage } : {}),
              ...(result.claudeSessionId ? { claudeSessionId: result.claudeSessionId } : {}),
            },
          };
        },
        onError: (message) => {
          followUpLifecycle?.onError();
          return {
            content: `Sub-agent "${running.name}" error: ${message}`,
            details: { name: running.name, task: running.task, error: message },
          };
        },
      });

      return {
        content: [
          {
            type: "text",
            text:
              `Sub-agent "${params.name}" launched and is now running in the background. ` +
              `Do NOT generate or assume any results — you have no idea what the sub-agent will do or produce. ` +
              `The results will be delivered to you automatically as a steer message when the sub-agent finishes. ` +
              `Until then, move on to other work or tell the user you're waiting.`,
          },
        ],
        details: {
          id: running.id,
          name: params.name,
          task: params.task,
          agent: params.agent,
          sessionFile: running.sessionFile,
          launchScriptFile: running.launchScriptFile,
          ...(ownedWorktree ? { worktreePath: ownedWorktree.path } : {}),
          status: "started",
        },
      };
    },

    ...ordinaryToolRenderers,
  });
  return ordinaryTool;
}
export type OrdinaryTool = ReturnType<typeof createOrdinaryTool>;
