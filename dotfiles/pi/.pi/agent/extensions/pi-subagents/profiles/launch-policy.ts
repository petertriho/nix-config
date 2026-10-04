import type {
  AgentDefaultsLike as AgentDefaults,
  LaunchBehavior,
  PiParentSelection,
} from "../execution/services.ts";
import type { SubagentParamsType } from "../registration/schemas.ts";

type SubagentSessionMode = LaunchBehavior["sessionMode"];

const SPAWNING_TOOLS = new Set([
  "Agent",
  "SendMessage",
  "ListAgents",
  "AgentInterrupt",
  "TeamStop",
  "workflow_spawn",
  "workflow_resume",
  "workflow_recover",
  "workflow_complete",
  "workflow_gate",
]);

/**
 * Resolve the effective set of denied tool names from agent defaults.
 * `spawning: false` expands to all SPAWNING_TOOLS.
 * `deny-tools` adds individual tool names on top.
 */
export function resolveDenyTools(agentDefs: AgentDefaults | null): Set<string> {
  const denied = new Set<string>();
  if (!agentDefs) return denied;

  if (agentDefs.spawning === false) {
    for (const t of SPAWNING_TOOLS) denied.add(t);
  }

  if (agentDefs.denyTools) {
    for (const t of agentDefs.denyTools
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      denied.add(t);
    }
  }

  return denied;
}

export function resolveEffectiveSessionMode(
  params: SubagentParamsType,
  agentDefs: AgentDefaults | null,
): SubagentSessionMode {
  if (params.fork) return "fork";
  return agentDefs?.sessionMode ?? "standalone";
}

export function resolveLaunchBehavior(
  params: SubagentParamsType,
  agentDefs: AgentDefaults | null,
): {
  sessionMode: SubagentSessionMode;
  seededSessionMode: "lineage-only" | "fork" | null;
  inheritsConversationContext: boolean;
  taskDelivery: "direct" | "artifact";
} {
  const sessionMode = resolveEffectiveSessionMode(params, agentDefs);
  const inheritsConversationContext = sessionMode === "fork";
  return {
    sessionMode,
    seededSessionMode: sessionMode === "standalone" ? null : sessionMode,
    inheritsConversationContext,
    taskDelivery: inheritsConversationContext ? "direct" : "artifact",
  };
}

export function resolvePiModelArgument(
  params: SubagentParamsType,
  agentDefs: Pick<AgentDefaults, "model" | "thinking"> | null,
  parentSelection: PiParentSelection,
): string | undefined {
  const parentModel = parentSelection.model
    ? `${parentSelection.model.provider}/${parentSelection.model.id}`
    : undefined;
  if (params.model === "parent" || params.model === "inherit") {
    if (!parentModel) throw new Error("The parent session has no active model.");
    return parentSelection.thinkingLevel ? `${parentModel}:${parentSelection.thinkingLevel}` : parentModel;
  }
  const configuredModel = params.model ?? agentDefs?.model;
  const effectiveModel = configuredModel ?? parentModel;
  if (!effectiveModel) return undefined;

  const thinking =
    agentDefs?.thinking ?? (configuredModel === undefined ? parentSelection.thinkingLevel : undefined);
  return thinking ? `${effectiveModel}:${thinking}` : effectiveModel;
}

/**
 * Decide whether a subagent is interactive (user-driven, long-running).
 *
 * Resolution order:
 *   1. Explicit `interactive` tool parameter wins.
 *   2. Explicit `interactive` frontmatter field on the agent.
 *   3. Default: the inverse of `auto-exit`. Agents that auto-exit are
 *      autonomous and the parent session should be woken on stall/recovery
 *      transitions. Agents that don't auto-exit are driven by the user in
 *      their own pane and stall pings are noise.
 *
 * When no agent defs exist at all (bare `subagent({ name, task })` call,
 * typical for `/subtask` with `fork: true`), the agent is interactive.
 */
export function resolveEffectiveInteractive(
  params: SubagentParamsType,
  agentDefs: AgentDefaults | null,
): boolean {
  if (params.interactive != null) return params.interactive;
  if (agentDefs?.interactive != null) return agentDefs.interactive;
  return !(agentDefs?.autoExit ?? false);
}
