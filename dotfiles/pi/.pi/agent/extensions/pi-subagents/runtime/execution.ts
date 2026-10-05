import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  type LaunchProfile, type LaunchProfileResources, type LaunchProfileWorkflowMetadata,
  type PrimarySkillIdentity, updateLaunchProfile,
} from "../execution/launch-profile.ts";
import { type ResolvedModelSelection, resolveModelPolicy } from "../profiles/model-picker.ts";
import {
  createSubagentExecutionServices, type LaunchContext, type LaunchProfileInput,
  type SubagentResult, type SubagentResumeParams, type SubagentToolResult,
  type RunningSubagent, type TaskRuntimeOptions, type TeamLaunchSpec,
  type ResumeLifecycleContext,
} from "../execution/services.ts";
import { closeSurface, createSurface, isTmuxAvailable, muxSetupHint, pollForExit, readScreen, sendLongCommand } from "../adapters/tmux.ts";
import type { SubagentParamsType } from "../registration/schemas.ts";
import { normalizeSubagentParams } from "../registration/schemas.ts";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import { resolveLaunchBehavior, resolveEffectiveInteractive, resolvePiModelArgument, resolveDenyTools } from "../profiles/launch-policy.ts";
import type { SubagentRuntime } from "./refresh.ts";

export function muxUnavailableResult() {
  return {
    content: [
      {
        type: "text" as const,
        text: `Subagents require tmux. ${muxSetupHint()}`,
      },
    ],
    details: { error: "tmux not available" },
  };
}

export function createExecutionRuntime(subagentsDir: string, discovery: AgentDiscovery, runtime: SubagentRuntime) {
  const { getAgentConfigDir, loadAgentDefaults, resolveSubagentPaths } = discovery;
  const { runningSubagents, observeRunningSubagent, startWidgetRefresh, startStatusRefresh, updateWidget, getModuleAbortSignal } = runtime;
  const subagentExecution = createSubagentExecutionServices({
    subagentsDir: subagentsDir,
    getAgentConfigDir,
    normalizeSubagentParams,
    loadAgentDefaults,
    resolveSubagentPaths,
    resolveLaunchBehavior,
    resolveEffectiveInteractive,
    resolvePiModelArgument,
    resolveDenyTools,
    runningSubagents,
    observeRunningSubagent,
    startWidgetRefresh,
    startStatusRefresh,
    updateWidget,
    isTmuxAvailable,
    muxUnavailableResult,
    createSurface,
    sendLongCommand,
    closeSurface,
    pollForExit,
    readScreen,
    getModuleAbortSignal,
    onRolloverLaunched: ({ running, recovery }) => {
      if (recovery) {
        try {
          updateLaunchProfile(running.sessionFile, (next) => ({
            ...next,
            runtime: { ...next.runtime, previousFailure: recovery.failure },
          }));
        } catch {
          // The launch succeeded even if the profile update failed.
        }
      }
    },
  });

  function resolvePrimarySkill(
    effectiveSkills: string | undefined,
    cwd?: string,
    agentDir?: string,
  ): PrimarySkillIdentity | undefined {
    return subagentExecution.resolvePrimarySkill(effectiveSkills, cwd, agentDir);
  }

  function collectResourceFingerprints(
    pi: ExtensionAPI | undefined,
    effectiveSkills: string | undefined,
  ): LaunchProfileResources {
    return subagentExecution.collectResourceFingerprints(pi, effectiveSkills);
  }

  function buildLaunchProfile(input: LaunchProfileInput): LaunchProfile {
    return subagentExecution.buildLaunchProfile(input);
  }

  async function executeSubagentResume(
    pi: ExtensionAPI,
    params: SubagentResumeParams,
    ctx: LaunchContext & Parameters<typeof resolveModelPolicy>[1],
    lifecycle?: ResumeLifecycleContext,
  ): Promise<SubagentToolResult> {
    return subagentExecution.executeSubagentResume(pi, params, ctx, undefined, lifecycle);
  }

  /**
   * Launch a subagent: creates the tmux pane, builds the command, and sends it.
   * Returns a RunningSubagent. Does NOT poll; call watchSubagent() to observe
   * completion.
   *
   * With `rolloverFrom`, launches a fresh same-role rollover child instead of an
   * agent-frontmatter spawn: the stored role snapshot supplies the role body,
   * system-prompt mode, controls, cwd, and agent dir, while tools, discovered
   * skills, and the primary-skill expansion come from the current environment.
   * The child is always a standalone session, never a full-context fork.
   */
  async function launchSubagent(
    rawParams: SubagentParamsType,
    ctx: LaunchContext,
    options?: {
      surface?: string;
      workflow?: LaunchProfileWorkflowMetadata;
      resolvedModel?: ResolvedModelSelection;
      rolloverFrom?: LaunchProfile;
      taskRuntime?: TaskRuntimeOptions;
      team?: TeamLaunchSpec;
      signal?: AbortSignal;
      isOwned?: () => boolean;
    },
  ): Promise<RunningSubagent> {
    return subagentExecution.launchSubagent(rawParams, ctx, options);
  }

  /**
   * Watch a launched subagent until it exits. Polls for completion, extracts
   * the summary from the session file, closes the pane, and removes the entry
   * from runningSubagents.
   */
  async function watchSubagent(
    running: RunningSubagent,
    signal: AbortSignal,
  ): Promise<SubagentResult> {
    return subagentExecution.watchSubagent(running, signal);
  }
  return { subagentExecution, resolvePrimarySkill, collectResourceFingerprints,
    buildLaunchProfile, executeSubagentResume, launchSubagent, watchSubagent };
}
export type ExecutionRuntime = ReturnType<typeof createExecutionRuntime>;
