import { resolveCliModel, type ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ModelSelection } from "../execution/launch-profile.ts";
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
  modelRegistry?: Pick<ModelRegistry, "getAll" | "hasConfiguredAuth">,
): string | undefined {
  const resolved = resolvePiModelSelection(params, agentDefs, parentSelection, modelRegistry);
  return resolved.selection?.thinking
    ? `${resolved.argument}:${resolved.selection.thinking}`
    : resolved.argument;
}

/**
 * Resolve the CLI model reference and persisted identity together.
 * Pass selection.thinking through --thinking, not as an ambiguous model-ID suffix.
 */
export function resolvePiModelSelection(
  params: SubagentParamsType,
  agentDefs: Pick<AgentDefaults, "model" | "thinking"> | null,
  parentSelection: PiParentSelection,
  modelRegistry?: Pick<ModelRegistry, "getAll" | "hasConfiguredAuth">,
): { argument?: string; selection?: ModelSelection } {
  const parentModel = parentSelection.model
    ? `${parentSelection.model.provider}/${parentSelection.model.id}`
    : undefined;
  const inheritsParent = params.model === "parent" || params.model === "inherit";
  if (inheritsParent && !parentModel) {
    throw new Error("The parent session has no active model.");
  }
  const configuredModel = inheritsParent ? undefined : params.model ?? agentDefs?.model;
  const effectiveModel = configuredModel ?? parentModel;
  if (!effectiveModel) return {};

  let thinking = (inheritsParent
    ? parentSelection.thinkingLevel
    : agentDefs?.thinking ?? (configuredModel === undefined ? parentSelection.thinkingLevel : undefined)
  ) as ModelSelection["thinking"];
  let selectedModel = parentSelection.model;
  if (configuredModel !== undefined) {
    // Preserve argument-only compatibility when no registry can establish an identity.
    if (!modelRegistry) {
      return { argument: thinking ? `${effectiveModel}:${thinking}` : effectiveModel };
    }
    const models = modelRegistry.getAll();
    // SAFETY: The SDK resolver reads only the catalog and configured-auth status from its runtime.
    const resolved = resolveCliModel({
      cliModel: configuredModel,
      modelRuntime: {
        getModels: () => models,
        hasConfiguredAuth: (provider: string) => models.some(
          (model) => model.provider === provider && modelRegistry.hasConfiguredAuth(model),
        ),
      } as unknown as Parameters<typeof resolveCliModel>[0]["modelRuntime"],
    });
    if (resolved.error) throw new Error(resolved.error);
    selectedModel = resolved.model;
    thinking = thinking ?? resolved.thinkingLevel;
  }
  if (!selectedModel) return {};

  const selection: ModelSelection = {
    provider: selectedModel.provider,
    model: selectedModel.id,
    ...(thinking ? { thinking } : {}),
  };
  const reference = `${selection.provider}/${selection.model}`;
  return {
    argument: reference,
    selection,
  };
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
