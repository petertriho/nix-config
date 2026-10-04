import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStatusConfig } from "./telemetry/status.ts";
import {
  buildResumePiArgs, buildSubagentToolAllowlist, buildPiPromptArgs, formatElapsed,
  getShellReadyDelayMs, parseLegacyModelSelection, resolveResultPresentation,
  resolveResumeLaunchBehavior, resolveUsageDetails,
} from "./execution/services.ts";
import { createAgentDiscovery, parseAgentDefinition } from "./profiles/discovery.ts";
import {
  resolveEffectiveSessionMode, resolveLaunchBehavior, resolvePiModelArgument,
  resolveEffectiveInteractive, resolveDenyTools,
} from "./profiles/launch-policy.ts";
import { createAgentModelManager } from "./profiles/model-manager.ts";
import { normalizeSubagentParams } from "./registration/schemas.ts";
import { createSubagentRuntime } from "./runtime/refresh.ts";
import { createExecutionRuntime } from "./runtime/execution.ts";
import { createTaskRpcAdapter } from "./runtime/task-rpc.ts";
import { createWorkflowAdapter } from "./runtime/workflow-adapter.ts";
import { createSessionState } from "./runtime/session-state.ts";
import { createTeamRuntime } from "./runtime/teams.ts";
import { createTeamLauncher } from "./runtime/team-launch.ts";
import { createOrdinaryTool } from "./runtime/ordinary-agents.ts";
import { createNamedFollowUp } from "./runtime/named-followups.ts";
import { registerSessionLifecycle } from "./registration/lifecycle.ts";
import { registerTeamEvents } from "./registration/team-events.ts";
import { registerAgentTool } from "./registration/agent-tool.ts";
import { registerMessageTools } from "./registration/message-tools.ts";
import { registerRetiredTools, type RetiredToolFixtures } from "./registration/retired-tools.ts";
import { registerCommands } from "./registration/commands.ts";
import { applyWidgetMargin, formatWidgetRightLabel, renderWidgetAgentContent } from "./presentation/widget.ts";
import { buildStatusRefreshMessage } from "./presentation/status-message.ts";
import { registerMessageRenderers } from "./presentation/message-renderers.ts";

// All launch targets and bundled/config resources remain rooted beside this entry.
const SUBAGENTS_DIR = dirname(fileURLToPath(import.meta.url));

// Recreate shared module state on reload even when imported modules are cached.
const runtime = createSubagentRuntime(() => loadStatusConfig(
  join(SUBAGENTS_DIR, "config.json"),
  join(SUBAGENTS_DIR, "config.json.example"),
));
const discovery = createAgentDiscovery(SUBAGENTS_DIR);
const execution = createExecutionRuntime(SUBAGENTS_DIR, discovery, runtime);
const tasks = createTaskRpcAdapter(discovery, runtime, execution);
const workflow = createWorkflowAdapter(discovery, runtime, execution);
const manageAgentModels = createAgentModelManager(discovery.discoverAgentDefinitions);
const retiredToolFixtures: RetiredToolFixtures = new Map();

const {
  rearmModuleAbortController, renderSubagentWidgetLines, observeRunningSubagent,
  resolveInterruptTarget, requestSubagentInterrupt, handleSubagentInterrupt, runningSubagents,
} = runtime;
const { loadAgentDefaults, discoverAgentDefinitions, getBundledAgentsDir } = discovery;
const {
  buildLaunchProfile, collectResourceFingerprints, resolvePrimarySkill, launchSubagent,
} = execution;
const {
  attachPiTasksRpcBridge, shutdownPiTasksRpcBridge, getAttachedTaskRpcForTests,
  resetTaskRpcForTests, getTaskAgentProfileDirs, createTaskRpcRuntimeHooks,
  resolveAndLaunchTaskRpc, readTaskPartialResult,
} = tasks;
const { attachWorkflowProvider, shutdownWorkflowProvider } = workflow;

export const __test__ = {
  retiredTool: (name: string) => retiredToolFixtures.get(name),
  rearmModuleAbortController,
  applyWidgetMargin,
  getShellReadyDelayMs,
  renderSubagentWidgetLines,
  parseAgentDefinition,
  loadAgentDefaults,
  discoverAgentDefinitions,
  getBundledAgentsDir,
  resolveEffectiveSessionMode,
  resolveLaunchBehavior,
  resolvePiModelArgument,
  resolveEffectiveInteractive,
  buildSubagentToolAllowlist,
  buildPiPromptArgs,
  normalizeSubagentParams,
  formatWidgetRightLabel,
  renderWidgetAgentContent,
  buildStatusRefreshMessage,
  observeRunningSubagent,
  resolveDenyTools,
  resolveInterruptTarget,
  requestSubagentInterrupt,
  handleSubagentInterrupt,
  resolveResultPresentation,
  resolveUsageDetails,
  resolveResumeLaunchBehavior,
  buildResumePiArgs,
  buildLaunchProfile,
  collectResourceFingerprints,
  parseLegacyModelSelection,
  resolvePrimarySkill,
  launchSubagent,
  runningSubagents,
  formatElapsed,
  attachPiTasksRpcBridge,
  shutdownPiTasksRpcBridge,
  getAttachedTaskRpcForTests,
  resetTaskRpcForTests,
  getTaskAgentProfileDirs,
  createTaskRpcRuntimeHooks,
  resolveAndLaunchTaskRpc,
  readTaskPartialResult,
  attachWorkflowProvider,
  shutdownWorkflowProvider,
};

export default function piTmuxSubagents(pi: ExtensionAPI): void {
  retiredToolFixtures.clear();
  const session = createSessionState();
  const deniedTools = new Set(
    (process.env.PI_DENY_TOOLS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const team = createTeamRuntime(pi, discovery, runtime, session);
  const shouldRegister = (name: string) => !deniedTools.has(name) ||
    (Boolean(team.memberMailbox) && (name === "SendMessage" || name === "ListAgents"));

  registerSessionLifecycle(pi, runtime, session, team, tasks, workflow);
  registerTeamEvents(pi, discovery, team, shouldRegister);

  const ordinaryTool = createOrdinaryTool(pi, discovery, execution, session);
  retiredToolFixtures.set("subagent", ordinaryTool);
  const launchTeamAgent = createTeamLauncher(pi, discovery, execution, team);
  registerAgentTool(pi, discovery, execution, ordinaryTool, team, launchTeamAgent, shouldRegister);
  const followUp = createNamedFollowUp(pi, discovery, runtime, execution, ordinaryTool, session);
  registerMessageTools(pi, discovery, runtime, session, team, followUp, shouldRegister);
  registerRetiredTools(pi, discovery, runtime, execution, retiredToolFixtures, shouldRegister);
  registerCommands(pi, discovery, manageAgentModels);
  registerMessageRenderers(pi);
}
