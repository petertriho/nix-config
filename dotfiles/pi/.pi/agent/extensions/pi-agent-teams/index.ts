import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { defineTool, keyText } from "@earendil-works/pi-coding-agent";
import { Box, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type, type Static } from "typebox";
import { allocateAgentWorktree, releaseUnusedWorktree, type OwnedWorktree } from "./agent-worktree.ts";
import { checkLeadAdmission, preflightTeamChild, recordLeadStart, type LeadReceipt } from "./team-admission.ts";
import {
  answerApproval, canonicalCall, verifyApprovalRequest,
  type ApprovalRequest, type ApprovalResponse,
} from "./team-approval.ts";
import { TeamCoordinator } from "./team-coordinator.ts";
import { createMemberMailbox, LEGACY_NATIVE_TASK_HOLD } from "./team-transport.ts";
import {
  type ActivityReadResult,
  type SubagentActivityState,
  readSubagentActivityFile,
} from "./activity.ts";
import {
  type LaunchProfile,
  type LaunchProfileResources,
  type LaunchProfileWorkflowMetadata,
  type ModelSelection,
  type PrimarySkillIdentity,
  THINKING_LEVELS,
  updateLaunchProfile,
} from "./launch-profile.ts";
import {
  AGENT_MODELS_VERSION,
  agentModelsPath,
  readAgentModelConfig,
  writeAgentModelConfig,
} from "./agent-models.ts";
import {
  parseExplicitModelSelection,
  pickModelSelection,
  resolveConfiguredAgentModel,
  resolveModelPolicy,
  type ResolvedModelSelection,
} from "./model-picker.ts";
import { classifyProviderFailure } from "../workflow-provider/failure.ts";
import { findLastAssistantMessage, getNewEntries } from "./session.ts";
import {
	attachTaskRpc,
	resolveTaskAgentProfile,
	resolveTaskLaunchModel,
	type AttachedTaskRpc,
	type NormalizedTaskSpawnOptions,
	type TaskAgentProfileDirs,
	type TaskRunHandle,
	type TaskRpcRuntimeHooks,
	type TaskSpawnSpec,
} from "./pi-tasks-rpc.ts";
import {
  type SubagentUsageSummary,
  formatUsageSummary,
  withContextWindow,
} from "./usage.ts";
import {
  type StatusSnapshot,
  type SubagentStatusKind,
  type SubagentStatusState,
  type SubagentStatusTransition,
  advanceStatusState,
  capStatusLines,
  classifyStatus,
  forceStatusAfterInterrupt,
  formatStatusAggregate,
  formatTransitionLine,
  loadStatusConfig,
  observeStatus,
} from "./status.ts";
import {
  closeSurface,
  createSurface,
  isTmuxAvailable,
  muxSetupHint,
  pollForExit,
  readScreen,
  renameCurrentTab,
  sendEscape,
  sendLongCommand,
} from "./tmux.ts";
import {
  applyPanelMargin,
  chooseWidthCandidate,
  formatIdentity,
  formatKeyHint,
  formatMetadata,
  formatSeparator,
  formatState,
  formatStateLabel,
  renderPanelBottom,
  renderPanelRow,
  renderPanelTop,
  sanitizeDisplayLine,
  sanitizeDisplayText,
  span,
  type SemanticState,
  type UiTheme,
} from "./ui.ts";
import {
  buildResumePiArgs,
  buildSubagentToolAllowlist,
  createSubagentExecutionServices,
  formatElapsed,
  getDefaultSessionDirFor,
  resolveResultPresentation,
  resolveResumeLaunchBehavior,
  type TeamLaunchSpec,
} from "./subagent-services.ts";
import {
  attachTmuxWorkflowProvider,
  tmuxWorkflowProviderIO,
} from "./workflow-provider.ts";

const SUBAGENTS_DIR = dirname(fileURLToPath(import.meta.url));

// Survive /reload: clear timers and abort poll loops from the previous module load.
// /reload re-imports this file, giving fresh module-level state, but closures from
// the old module keep running.
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

const SubagentParams = Type.Object({
  name: Type.String({ description: "Display name for the subagent" }),
  task: Type.String({ description: "Task/prompt for the sub-agent" }),
  agent: Type.Optional(
    Type.String({
      description:
        "Agent name to load defaults from (e.g. 'worker', 'scout', 'reviewer'). Reads <agent>.md from the bundled agents, ~/.pi/agent/agents, or ./.pi/agents for model, tools, skills.",
    }),
  ),
  systemPrompt: Type.Optional(
    Type.String({ description: "Appended to system prompt (role instructions)" }),
  ),
  model: Type.Optional(
    Type.String({
      description:
        "Model policy: 'parent' or 'inherit' uses the parent session model and thinking. 'pick' opens the shared model and thinking picker. 'previous' is invalid for new spawns. An explicit value uses 'provider/model[:thinking]', such as 'anthropic/claude-opus-4-5:high'. Omit to use the agent's configured default from ~/.pi/agent/agent-models.json (managed by /agent-models), else the agent frontmatter model, else the parent session model.",
    }),
  ),
  skills: Type.Optional(
    Type.String({ description: "Comma-separated skills (overrides agent default)" }),
  ),
  tools: Type.Optional(
    Type.String({ description: "Comma-separated tools (overrides agent default)" }),
  ),
  cwd: Type.Optional(
    Type.String({
      description:
        "Working directory for the sub-agent. The agent starts in this folder and picks up its local .pi/ config, CLAUDE.md, skills, and extensions. Use for role-specific subfolders.",
    }),
  ),
  fork: Type.Optional(
    Type.Boolean({
      description:
        "Force the full-context fork mode for this spawn. The sub-agent inherits the current session conversation, overriding any agent frontmatter session-mode.",
    }),
  ),
  interactive: Type.Optional(
    Type.Boolean({
      description:
        "Mark the subagent as interactive (long-running, user drives the conversation in its own pane). When true, the main session is not woken by status transitions (stalled/recovered) for this subagent. If omitted, falls back to the agent's `interactive` frontmatter, otherwise the inverse of `auto-exit` (agents that auto-exit are autonomous and get stall pings; agents that don't are interactive and stay quiet).",
    }),
  ),
  resumeSessionId: Type.Optional(
    Type.String({
      description:
        "Resume a previous Claude Code session by its ID. Loads the conversation history and continues where it left off. The session ID is returned in details of every claude tool call. Use this to retry cancelled runs or ask follow-up questions.",
    }),
  ),
});

type SubagentParamsType = Static<typeof SubagentParams>;

type FinishedOrdinaryAgent =
  | { backend: "pi"; id: string; sessionPath: string }
  | {
    backend: "claude";
    id: string;
    claudeSessionId: string;
    launch: Pick<SubagentParamsType, "agent" | "cwd" | "model" | "systemPrompt" | "interactive">;
  };

/** Internal callbacks for a saved ordinary-agent follow-up, not tool arguments. */
interface OrdinaryFollowUp {
  followUpName?: string;
  followUpLifecycle?: { onResult(): void; onError(): void };
}

// Claude requires a description and prompt, but not a display name.
const AgentParams = Type.Object({
  description: Type.String({ description: "Short description of the task" }),
  prompt: Type.String({ description: "Task for the agent" }),
  subagent_type: Type.Optional(Type.String({ description: "Agent definition to use (defaults to general-purpose)" })),
  name: Type.Optional(Type.String({ description: "Display name (ordinary agent unless eligible team coordination is available)" })),
  run_in_background: Type.Optional(Type.Boolean({ description: "Return immediately (default) or wait for the result" })),
  isolation: Type.Optional(Type.String({
    description: 'Only isolation: "worktree" creates a separate git worktree. Omitted isolation, "shared", and all other values use the shared working directory. Shared runs keep normal team-admission checks.',
  })),
  fork: Type.Optional(Type.Boolean({ description: "Pi-only full-context fork of the current session" })),
  model: Type.Optional(Type.String({
    description: 'Pi-only model selection. Set model: "inherit" (alias "parent") to use the parent session\'s active model and thinking level. This overrides agent defaults. "pick" opens an interactive model picker. "previous" uses the saved model when resuming and is invalid for new spawns. An explicit selection uses provider/model[:thinking]. Omit model to use the default selection for the agent or saved session.',
  })),
  systemPrompt: Type.Optional(Type.String({ description: "Pi-only appended system prompt" })),
  skills: Type.Optional(Type.String({ description: "Pi-only comma-separated skills override" })),
  tools: Type.Optional(Type.String({ description: "Pi-only comma-separated tools override" })),
  cwd: Type.Optional(Type.String({ description: "Pi-only child working directory" })),
  interactive: Type.Optional(Type.Boolean({ description: "Pi-only child interactivity" })),
  resume: Type.Optional(Type.String({ description: "Resume a Claude CLI session by ID or a saved Pi session by absolute path" })),
  resumeSessionId: Type.Optional(Type.String({ description: "Pi-only alias for a Claude CLI session ID" })),
  max_turns: Type.Optional(Type.Number({ description: "Positive integer turn limit for an autonomous run; 0 means no limit" })),
  team_name: Type.Optional(Type.String({ description: "Optional team name for an eligible interactive Pi agent" })),
}, { additionalProperties: false });

type AgentCall = Static<typeof AgentParams> & { mode?: string };

function normalizeAgentCall(input: AgentCall): AgentCall {
  const params = { ...input };
  for (const key of [
    "subagent_type", "name", "isolation", "model", "systemPrompt",
    "skills", "tools", "cwd", "resume", "resumeSessionId", "team_name", "mode",
  ] as const) {
    if (typeof params[key] === "string" && !params[key].trim()) delete params[key];
  }
  if (params.isolation !== "worktree") delete params.isolation;
  if (params.max_turns === 0) delete params.max_turns;
  return params;
}

const OPTIONAL_STRING_PARAMS = [
  "agent",
  "systemPrompt",
  "model",
  "skills",
  "tools",
  "cwd",
  "resumeSessionId",
] as const;

/**
 * Some models fill every optional string parameter with "" instead of omitting
 * it. An empty `tools` or `skills` would otherwise override the agent's
 * frontmatter through `params.x ?? agentDefs.x`. Treat blank strings as absent.
 */
function normalizeSubagentParams(params: SubagentParamsType): SubagentParamsType {
  const normalized: SubagentParamsType = { ...params };
  for (const key of OPTIONAL_STRING_PARAMS) {
    const value = normalized[key];
    if (typeof value === "string" && value.trim() === "") {
      delete normalized[key];
    }
  }
  return normalized;
}

type SubagentSessionMode = "standalone" | "lineage-only" | "fork";

interface AgentDefaults {
  model?: string;
  tools?: string;
  skills?: string;
  thinking?: string;
  denyTools?: string;
  spawning?: boolean;
  autoExit?: boolean;
  interactive?: boolean;
  systemPromptMode?: "append" | "replace";
  sessionMode?: SubagentSessionMode;
  cwd?: string;
  cli?: string;
  body?: string;
  disableModelInvocation?: boolean;
}

type AgentSource = "package" | "global" | "project";

interface AgentDefinition extends AgentDefaults {
  name: string;
  description?: string;
  disableModelInvocation: boolean;
}

interface ListedAgentDefinition extends AgentDefinition {
  source: AgentSource;
  /** File basename — the identifier `agent:` spawns resolve against. */
  fileName: string;
}

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
function resolveDenyTools(agentDefs: AgentDefaults | null): Set<string> {
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

function getAgentConfigDir(): string {
  return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

function getBundledAgentsDir(): string {
  return join(SUBAGENTS_DIR, "agents");
}

function getFrontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match ? match[1].trim() : undefined;
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  return value == null ? undefined : value === "true";
}

function parseSessionMode(value: string | undefined): SubagentSessionMode | undefined {
  if (value === "standalone" || value === "lineage-only" || value === "fork") {
    return value;
  }
  return undefined;
}

function parseAgentDefinition(content: string, fallbackName: string): AgentDefinition | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const body = content.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
  const systemPromptMode = getFrontmatterValue(frontmatter, "system-prompt");

  return {
    name: getFrontmatterValue(frontmatter, "name") ?? fallbackName,
    description: getFrontmatterValue(frontmatter, "description"),
    model: getFrontmatterValue(frontmatter, "model"),
    tools: getFrontmatterValue(frontmatter, "tools"),
    systemPromptMode:
      systemPromptMode === "replace"
        ? "replace"
        : systemPromptMode === "append"
          ? "append"
          : undefined,
    skills: getFrontmatterValue(frontmatter, "skill") ?? getFrontmatterValue(frontmatter, "skills"),
    thinking: getFrontmatterValue(frontmatter, "thinking"),
    denyTools: getFrontmatterValue(frontmatter, "deny-tools"),
    spawning: parseOptionalBoolean(getFrontmatterValue(frontmatter, "spawning")),
    autoExit: parseOptionalBoolean(getFrontmatterValue(frontmatter, "auto-exit")),
    interactive: parseOptionalBoolean(getFrontmatterValue(frontmatter, "interactive")),
    sessionMode: parseSessionMode(getFrontmatterValue(frontmatter, "session-mode")),
    cwd: getFrontmatterValue(frontmatter, "cwd"),
    cli: getFrontmatterValue(frontmatter, "cli"),
    body: body || undefined,
    disableModelInvocation:
      getFrontmatterValue(frontmatter, "disable-model-invocation")?.toLowerCase() === "true",
  };
}

function discoverAgentDefinitions(): ListedAgentDefinition[] {
  const agents = new Map<string, ListedAgentDefinition>();
  const dirs: Array<{ path: string; source: AgentSource }> = [
    { path: getBundledAgentsDir(), source: "package" },
    { path: join(getAgentConfigDir(), "agents"), source: "global" },
    { path: join(process.cwd(), ".pi", "agents"), source: "project" },
  ];

  for (const { path: dir, source } of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((entry) => entry.endsWith(".md"))) {
      const parsed = parseAgentDefinition(
        readFileSync(join(dir, file), "utf8"),
        file.replace(/\.md$/, ""),
      );
      if (!parsed) continue;
      agents.set(parsed.name, { ...parsed, fileName: file.replace(/\.md$/, ""), source });
    }
  }

  return [...agents.values()];
}

function resolveSubagentPaths(
  params: SubagentParamsType,
  agentDefs: AgentDefaults | null,
): { effectiveCwd: string | null; localAgentDir: string | null; effectiveAgentDir: string } {
  const rawCwd = params.cwd ?? agentDefs?.cwd ?? null;
  const cwdIsFromAgent = !params.cwd && agentDefs?.cwd != null;
  const cwdBase = cwdIsFromAgent ? getAgentConfigDir() : process.cwd();
  const effectiveCwd = rawCwd
    ? rawCwd.startsWith("/")
      ? rawCwd
      : join(cwdBase, rawCwd)
    : null;
  const localAgentDir = effectiveCwd ? join(effectiveCwd, ".pi", "agent") : null;
  const effectiveAgentDir =
    localAgentDir && existsSync(localAgentDir) ? localAgentDir : getAgentConfigDir();
  return { effectiveCwd, localAgentDir, effectiveAgentDir };
}

function resolveEffectiveSessionMode(
  params: SubagentParamsType,
  agentDefs: AgentDefaults | null,
): SubagentSessionMode {
  if (params.fork) return "fork";
  return agentDefs?.sessionMode ?? "standalone";
}

function resolveLaunchBehavior(
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

interface PiParentSelection {
  model?: Pick<NonNullable<ExtensionContext["model"]>, "provider" | "id">;
  thinkingLevel?: ExtensionContext["thinkingLevel"];
}

function resolvePiModelArgument(
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
function resolveEffectiveInteractive(
  params: SubagentParamsType,
  agentDefs: AgentDefaults | null,
): boolean {
  if (params.interactive != null) return params.interactive;
  if (agentDefs?.interactive != null) return agentDefs.interactive;
  return !(agentDefs?.autoExit ?? false);
}

function loadAgentDefaults(agentName: string): AgentDefaults | null {
  const configDir = getAgentConfigDir();
  const paths = [
    join(process.cwd(), ".pi", "agents", `${agentName}.md`),
    join(configDir, "agents", `${agentName}.md`),
    join(getBundledAgentsDir(), `${agentName}.md`),
  ];

  for (const p of paths) {
    if (!existsSync(p)) continue;
    const parsed = parseAgentDefinition(readFileSync(p, "utf8"), agentName);
    if (parsed) return parsed;
  }

  return null;
}

type AgentModelsContext = Pick<
  ExtensionContext,
  "hasUI" | "ui" | "scopedModels" | "modelRegistry" | "model" | "thinkingLevel"
>;

function agentModelsListLabel(def: ListedAgentDefinition, agents: Record<string, string>): string {
  // Config entries are keyed by the filename-based identifier the spawn path
  // looks up (`agents[params.agent]`), never the frontmatter `name:`, so a
  // default set here always matches the spawn that should use it.
  const id = def.fileName;
  const display = def.name === id ? "" : ` (${def.name})`;
  const configured = agents[id];
  const base = `${id}${display} — ${configured ?? "parent default"}`;
  if (def.cli) return `${base} · frontmatter only`;
  return base;
}

/**
 * Interactive manager behind `/agent-models`: list every discovered agent
 * with its configured default (or "parent default"), then set or clear one
 * entry at a time. Every change is validated against the registry and saved
 * immediately through the atomic write, so the on-disk config is always the
 * source of truth. Manifest workflow launches resolve models through their
 * persisted workflow policy and never consult this ad-hoc spawn config.
 * `cli:` agents keep their frontmatter model and offer no edits here.
 */
async function manageAgentModels(ctx: AgentModelsContext): Promise<void> {
  const done = "Done";
  while (true) {
    const read = readAgentModelConfig();
    if (read.status === "invalid") {
      ctx.ui.notify(
        `${read.error} Fix or remove the file before editing agent defaults here.`,
        "error",
      );
      return;
    }
    const agents = read.status === "ok" ? read.config.agents : {};
    const defs = discoverAgentDefinitions().sort((first, second) => first.fileName.localeCompare(second.fileName));
    const byLabel = new Map(defs.map((def) => [agentModelsListLabel(def, agents), def]));

    const choice = await ctx.ui.select(
      "Select an agent to configure its default model",
      [...byLabel.keys(), done],
    );
    if (choice === undefined || choice === done) return;
    const def = byLabel.get(choice);
    if (!def) return;
    const id = def.fileName;

    if (def.cli) {
      await ctx.ui.select(`${id} keeps its frontmatter model (cli agent)`, ["Back"]);
      continue;
    }

    const current = agents[id];
    const action = await ctx.ui.select(
      `${id} — ${current ?? "parent default"}`,
      ["Set model", ...(current ? ["Clear"] : []), "Back"],
    );
    if (action === "Set model") {
      let picked: Awaited<ReturnType<typeof pickModelSelection>>;
      try {
        picked = await pickModelSelection(ctx, {
          title: `Default model for ${id}`,
          subject: id,
          ...(current ? { currentRef: current } : {}),
        });
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
        continue;
      }
      if (!picked) continue;
      const next = { ...agents, [id]: picked.argument };
      try {
        parseExplicitModelSelection(picked.argument, ctx.modelRegistry.getAvailable());
        writeAgentModelConfig({ version: AGENT_MODELS_VERSION, agents: next });
        ctx.ui.notify(`Default model for ${id}: ${picked.argument}`, "info");
      } catch (error) {
        ctx.ui.notify(
          `Failed to save the default model for ${id}: `
          + `${error instanceof Error ? error.message : String(error)} `
          + `${agentModelsPath()} must be a real writable file `
          + "(not a read-only symlink, e.g. from home-manager).",
          "error",
        );
      }
    } else if (action === "Clear") {
      const next = { ...agents };
      delete next[id];
      try {
        writeAgentModelConfig({ version: AGENT_MODELS_VERSION, agents: next });
        ctx.ui.notify(
          `Cleared the default model for ${id}; it now uses the parent default.`,
          "info",
        );
      } catch (error) {
        ctx.ui.notify(
          `Failed to clear the default model for ${id}: `
          + `${error instanceof Error ? error.message : String(error)} `
          + `${agentModelsPath()} must be a real writable file `
          + "(not a read-only symlink, e.g. from home-manager).",
          "error",
        );
      }
    }
  }
}

/**
 * Wait long enough for a freshly created pane to finish shell startup.
 * Configurable through PI_SUBAGENT_SHELL_READY_DELAY_MS for slow shell init
 * (direnv, devenv). Default 5000ms.
 */
function getShellReadyDelayMs(): number {
  const raw = process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5000;
}

function muxUnavailableResult() {
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

const statusConfig = loadStatusConfig();

interface WidgetStatusPresentation {
  state: Extract<SemanticState, "starting" | "running" | "active" | "waiting" | "stalled">;
  detail?: string;
  duration?: string;
}

function formatWidgetRightLabel(snapshot: StatusSnapshot): WidgetStatusPresentation {
  if (snapshot.kind === "starting") return { state: "starting" };
  if (snapshot.kind === "running") {
    return { state: "running", duration: snapshot.elapsedText };
  }
  if (snapshot.kind === "active") {
    const label = snapshot.activityLabel ?? snapshot.activeScope;
    return {
      state: "active",
      ...(label ? { detail: label } : {}),
      ...(snapshot.activeDurationText ? { duration: snapshot.activeDurationText } : {}),
    };
  }
  if (snapshot.kind === "waiting") {
    return {
      state: "waiting",
      ...(snapshot.statusLabel ? { detail: snapshot.statusLabel } : {}),
      ...(snapshot.waitingDurationText ? { duration: snapshot.waitingDurationText } : {}),
    };
  }

  return {
    state: "stalled",
    ...(snapshot.statusLabel ? { detail: snapshot.statusLabel } : {}),
    ...(snapshot.snapshotProblemText ? { duration: snapshot.snapshotProblemText } : {}),
  };
}

/**
 * Resolve the registered context window for the model that produced the
 * aggregated usage, when that model is currently authenticated. Missing
 * registry or model entries leave the summary without a window — usage
 * observability never blocks on registry availability.
 */
function resolveUsageContextWindow(
  usage: SubagentUsageSummary,
  registry: LaunchContext["modelRegistry"],
): number | undefined {
  if (!usage.provider || !usage.model || !registry) return undefined;
  const model = registry
    .getAvailable()
    .find((candidate) => candidate.provider === usage.provider && candidate.id === usage.model);
  return model && model.contextWindow > 0 ? model.contextWindow : undefined;
}

/**
 * Enrich the child-session usage summary with the registered context
 * window and ratio. Returns undefined when the child produced no completed
 * requests, so callers can omit the field entirely.
 */
function resolveUsageDetails(
  result: Pick<SubagentResult, "usage">,
  ctx: LaunchContext,
): SubagentUsageSummary | undefined {
  if (!result.usage) return undefined;
  return withContextWindow(result.usage, resolveUsageContextWindow(result.usage, ctx.modelRegistry));
}

interface SubagentResult {
  name: string;
  task: string;
  summary: string;
  sessionFile?: string;
  claudeSessionId?: string;
  exitCode: number;
  elapsed: number;
  error?: string;
  /** Provider/agent error message when auto-retry exhausted (overload, rate limit, etc.). */
  errorMessage?: string;
  /** True when this run hit the hard task turn limit and was aborted. */
  turnLimit?: boolean;
  /**
   * Provider-neutral usage summary aggregated from the child session's
   * completed assistant entries. Present only when at least one completed
   * request exists; cache fields appear only when the provider reports them.
   */
  usage?: SubagentUsageSummary;
  /** True when this run produced a new assistant response, not only exit 0. */
  responded?: boolean;
  ping?: { name: string; message: string };
}

interface RunningSubagent {
  id: string;
  name: string;
  task: string;
  agent?: string;
  surface: string;
  startTime: number;
  sessionFile: string;
  launchScriptFile?: string;
  activityFile?: string;
  activity?: SubagentActivityState;
  activityRead?: {
    ok: boolean;
    reason?: "missing" | "invalid" | "wrong-id";
    error?: string;
  };
  abortController?: AbortController;
  cli?: string;
  sentinelFile?: string;
  statusState: SubagentStatusState;
  /**
   * When true, status transitions (stalled/recovered) do not wake the parent
   * session via a steer message. The widget still updates locally.
   */
  interactive: boolean;
  team?: { teamId: string; memberId: string; epoch: number; sessionId: string };
}

const runningSubagents = new Map<string, RunningSubagent>();
const retiredToolFixtures = new Map<string, ReturnType<typeof defineTool>>();

// ── pi-tasks RPC bridge (protocol-v2 provider) ──

let attachedTaskRpc: AttachedTaskRpc | null = null;
let taskRpcAttachInFlight: Promise<void> | null = null;
let taskRpcAttachEpoch = 0;

function getTaskAgentProfileDirs(): TaskAgentProfileDirs {
	return {
		project: join(process.cwd(), ".pi", "agents"),
		global: join(getAgentConfigDir(), "agents"),
		bundled: getBundledAgentsDir(),
	};
}

function readTaskPartialResult(handle: TaskRunHandle): string | undefined {
	try {
		if (!existsSync(handle.sessionFile)) return undefined;
		return findLastAssistantMessage(getNewEntries(handle.sessionFile, 0)) ?? undefined;
	} catch {
		return undefined;
	}
}

function createTaskRpcRuntimeHooks(
	pi: ExtensionAPI,
	ctx: LaunchContext,
): TaskRpcRuntimeHooks {
	return {
		async launch(spec: TaskSpawnSpec): Promise<TaskRunHandle> {
			// RPC task launches force autonomous behavior through taskRuntime
			// (interactive: false, autoExit: true, optional PI_SUBAGENT_MAX_TURNS).
			const running = await launchSubagent(
				{
					name: spec.options.description ?? spec.profile.fileName,
					task: spec.prompt,
					agent: spec.profile.fileName,
				},
				ctx,
				{
					resolvedModel: spec.resolvedModel,
					taskRuntime: {
						...(spec.options.maxTurns == null ? {} : { maxTurns: spec.options.maxTurns }),
					},
				},
			);
			const watcherAbort = new AbortController();
			running.abortController = watcherAbort;
			startWidgetRefresh();
			startStatusRefresh(pi);
			return {
				id: running.id,
				surface: running.surface,
				sessionFile: running.sessionFile,
				abortController: watcherAbort,
			};
		},
		watch(handle: TaskRunHandle, signal: AbortSignal) {
			const running = runningSubagents.get(handle.id);
			if (!running) {
				// The pane record vanished (e.g. a shutdown raced the deferred watch).
				return Promise.resolve({
					exitCode: 1,
					summary: "Task agent pane record was lost before watching started.",
					responded: false,
				});
			}
			return watchSubagent(running, signal);
		},
		sendEscape(handle: TaskRunHandle): void {
			sendEscape(handle.surface);
		},
		closeSurface(handle: TaskRunHandle): void {
			closeSurface(handle.surface);
			// Contain late launches: when the bridge closes a surface whose watcher
			// never started (shutdown raced the pane creation), the running entry
			// was added after the shutdown clear and must be dropped here. Normal
			// completion paths already deleted it — a second delete is a no-op.
			runningSubagents.delete(handle.id);
		},
		readPartialResult: readTaskPartialResult,
	};
}

async function resolveAndLaunchTaskRpc(
	pi: ExtensionAPI,
	ctx: LaunchContext,
	request: { type: string; prompt: string; options: NormalizedTaskSpawnOptions },
): Promise<{ spec: TaskSpawnSpec; handle: TaskRunHandle }> {
	const resolution = resolveTaskAgentProfile(request.type, getTaskAgentProfileDirs());
	if (!resolution.ok) throw new Error(resolution.error);
	const resolvedModel = resolveTaskLaunchModel({
		...(request.options.model ? { override: request.options.model } : {}),
		profile: resolution.profile,
		ctx: {
			modelRegistry: ctx.modelRegistry ?? { getAvailable: () => [] },
			...(ctx.model ? { parentModel: ctx.model } : {}),
			agentDir: getAgentConfigDir(),
		},
	});
	const spec: TaskSpawnSpec = {
		type: request.type,
		prompt: request.prompt,
		options: request.options,
		profile: resolution.profile,
		resolvedModel,
	};
	const handle = await createTaskRpcRuntimeHooks(pi, ctx).launch(spec);
	return { spec, handle };
}

/**
 * Register the protocol-v2 task RPC handlers on the root session (or abstain
 * when the original pi-subagents owns the channels). Idempotent per session;
 * /new, /resume, and /fork re-attach after their session_shutdown tore down.
 */
async function attachPiTasksRpcBridge(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
	if (attachedTaskRpc || taskRpcAttachInFlight) return;
	// Session generation: shutdown bumps it, invalidating any attach that is
	// still awaiting its bounded provider probe.
	const epoch = taskRpcAttachEpoch;
	const attempt = (async () => {
		const launchContext: LaunchContext = { ...ctx, pi };
		const attached = await attachTaskRpc({
			events: pi.events,
			hooks: createTaskRpcRuntimeHooks(pi, launchContext),
			resolveAndLaunch: (request) => resolveAndLaunchTaskRpc(pi, launchContext, request),
			notify: (message) => {
				ctx.ui.notify(message, "info");
			},
		});
		if (epoch !== taskRpcAttachEpoch) {
			// A shutdown completed while the provider probe was in flight. The
			// late registration binds a stale context: tear it down immediately
			// instead of letting it answer the next session's requests.
			if (attached) {
				attached.bridge.shutdown();
				attached.detach();
			}
			return;
		}
		if (attached) attachedTaskRpc = attached;
	})().finally(() => {
		// Clear only this attempt's marker. A shutdown-voided attempt can settle
		// after a newer attach is already in flight; unconditionally nulling here
		// would erase that attempt's marker and admit a third concurrent attach,
		// whose registration would duplicate the live handler set.
		if (taskRpcAttachInFlight === attempt) taskRpcAttachInFlight = null;
	});
	taskRpcAttachInFlight = attempt;
	await attempt;
}

function shutdownPiTasksRpcBridge(): void {
	// Invalidate any in-flight attach first so its post-probe epoch check
	// discards the late registration.
	taskRpcAttachEpoch++;
	if (attachedTaskRpc) {
		attachedTaskRpc.bridge.shutdown();
		attachedTaskRpc.detach();
		attachedTaskRpc = null;
	}
	taskRpcAttachInFlight = null;
}

function getAttachedTaskRpcForTests(): AttachedTaskRpc | null {
	return attachedTaskRpc;
}

function resetTaskRpcForTests(): void {
	shutdownPiTasksRpcBridge();
}

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

// ── Widget management ──

let latestCtx: ExtensionContext | null = null;

let widgetInterval: ReturnType<typeof setInterval> | null = null;

let statusInterval: ReturnType<typeof setInterval> | null = null;

function formatElapsedMMSS(startTime: number): string {
  const seconds = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function renderWidgetAgentContent(
  theme: UiTheme,
  agent: RunningSubagent,
  snapshot: StatusSnapshot,
  width: number,
): string {
  const status = formatWidgetRightLabel(snapshot);
  const elapsed = formatMetadata(theme, formatElapsedMMSS(agent.startTime));
  const fullIdentity = formatIdentity(theme, agent.name, agent.agent);
  const compactIdentity = formatIdentity(theme, agent.name);
  const state = formatState(theme, status.state);
  const glyph = formatState(theme, status.state, { glyphOnly: true });
  const detail = status.detail
    ? `${formatSeparator(theme)}${formatMetadata(theme, sanitizeDisplayLine(status.detail))}`
    : "";
  const duration = status.duration
    ? ` ${formatMetadata(theme, sanitizeDisplayLine(status.duration))}`
    : "";

  return chooseWidthCandidate(
    [
      `${elapsed}${formatSeparator(theme)}${fullIdentity}${formatSeparator(theme)}${state}${detail}${duration}`,
      `${compactIdentity}${formatSeparator(theme)}${state}${detail}`,
      `${compactIdentity}${formatSeparator(theme)}${state}`,
      state,
      glyph,
    ],
    width,
  );
}

function renderSubagentWidgetLines(
  theme: UiTheme,
  agents: RunningSubagent[],
  width: number,
): string[] {
  const count = agents.length;
  const lines: string[] = [renderPanelTop(theme, width, "Subagents", `${count} running`)];

  for (const agent of agents) {
    const snapshot = classifyStatus(agent.statusState, Date.now());
    let visibleStatus = snapshot;
    if (!statusConfig.enabled) {
      visibleStatus = {
        ...snapshot,
        kind: agent.cli === "claude" ? "running" : "starting",
        activeDurationText: null,
        waitingDurationText: null,
        snapshotProblemText: null,
        statusLabel: null,
      };
    }
    lines.push(
      renderPanelRow(
        theme,
        width,
        renderWidgetAgentContent(theme, agent, visibleStatus, Math.max(0, width - 2)),
      ),
    );
  }

  lines.push(renderPanelBottom(theme, width));
  return lines;
}

/**
 * Wrap widget lines in the same 1-column outer margin pi-tui-shell applies to
 * the editor frame (`applyOuterMargin`): ` line ` padded/truncated to width.
 * Keeps the Subagents panel's left and right edges flush with the editor box
 * instead of spanning the full terminal width from column 0.
 */
function applyWidgetMargin(lines: string[], width: number): string[] {
  return applyPanelMargin(lines, width);
}

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

function parseSkillList(skills: string | undefined): string[] {
  return (skills ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build the positional prompt args for a pi CLI subagent launch.
 *
 * Pi prepends every `@file` argument to the first positional message and
 * expands `/skill:<name> <args>` only when that first message starts with
 * `/skill:`. Later positional messages become separate prompts after the first
 * turn. So when skills are requested, the launcher passes exactly one argument,
 * `/skill:<first skill> <task text>`, and never combines it with `@file`.
 * Only the first skill can be expanded by the CLI; additional skills are named
 * in the task text. Without skills the task argument is passed through
 * (`@<artifact>` for artifact delivery, the task text for direct delivery).
 */
function buildPiPromptArgs(params: {
  effectiveSkills?: string;
  taskDelivery: "direct" | "artifact";
  taskArg: string;
  taskText: string;
}): string[] {
  const skills = parseSkillList(params.effectiveSkills);
  if (skills.length === 0) return [params.taskArg];

  const [first, ...rest] = skills;
  const extraSkillsNote =
    rest.length > 0
      ? `Also read and follow these skills from your available skills list before you start: ${rest.join(", ")}.\n\n`
      : "";
  return [`/skill:${first} ${extraSkillsNote}${params.taskText}`];
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

interface StatusTransitionItem {
  name: string;
  kind: SubagentStatusKind;
  transition: Exclude<SubagentStatusTransition, null>;
  elapsedText: string;
  activityLabel?: string;
  activeScope?: string;
  activeDurationText?: string;
  waitingDurationText?: string;
  snapshotProblemText?: string;
  statusLabel?: string;
}

interface StatusTransitionRecord {
  name: string;
  snapshot: StatusSnapshot;
  transition: Exclude<SubagentStatusTransition, null>;
}

function toStatusTransitionItem(record: StatusTransitionRecord): StatusTransitionItem {
  const { name, snapshot, transition } = record;
  return {
    name,
    kind: snapshot.kind,
    transition,
    elapsedText: snapshot.elapsedText,
    ...(snapshot.activityLabel ? { activityLabel: snapshot.activityLabel } : {}),
    ...(snapshot.activeScope ? { activeScope: snapshot.activeScope } : {}),
    ...(snapshot.activeDurationText ? { activeDurationText: snapshot.activeDurationText } : {}),
    ...(snapshot.waitingDurationText ? { waitingDurationText: snapshot.waitingDurationText } : {}),
    ...(snapshot.snapshotProblemText ? { snapshotProblemText: snapshot.snapshotProblemText } : {}),
    ...(snapshot.statusLabel ? { statusLabel: snapshot.statusLabel } : {}),
  };
}

function buildStatusRefreshMessage(
  transitions: StatusTransitionRecord[],
  lineLimit: number,
): {
  content: string;
  details: {
    lines: string[];
    items: StatusTransitionItem[];
    overflow: number;
  };
} {
  const lines = transitions.map(({ name, snapshot, transition }) =>
    formatTransitionLine(name, snapshot, transition)
  );
  const capped = capStatusLines(lines, lineLimit);
  return {
    content: formatStatusAggregate(lines, lineLimit),
    details: {
      lines: capped.visibleLines,
      items: transitions.slice(0, capped.visibleLines.length).map(toStatusTransitionItem),
      overflow: capped.overflow,
    },
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

const subagentExecution = createSubagentExecutionServices({
  subagentsDir: SUBAGENTS_DIR,
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

interface LaunchContext {
  pi?: ExtensionAPI;
  sessionManager: {
    getSessionFile(): string | undefined | null;
    getSessionId(): string;
    getSessionDir(): string;
  };
  cwd: string;
  model: ExtensionContext["model"];
  thinkingLevel?: ExtensionContext["thinkingLevel"];
  modelRegistry?: ExtensionContext["modelRegistry"];
  scopedModels?: ExtensionContext["scopedModels"];
  hasUI?: ExtensionContext["hasUI"];
  ui?: ExtensionContext["ui"];
}

interface LaunchProfileInput {
  displayName: string;
  agentName?: string;
  roleBody: string;
  systemPromptMode: "append" | "replace" | "message";
  cwd: string;
  agentDir: string;
  controls: {
    spawning?: boolean;
    denyTools: string[];
    autoExit?: boolean;
    interactive: boolean;
    sessionMode: "standalone" | "lineage-only" | "fork";
  };
  effectiveSkills?: string;
  modelArgument?: string;
  originalSessionPath: string;
  resources: LaunchProfileResources;
  workflow?: LaunchProfileWorkflowMetadata;
}

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

function parseLegacyModelSelection(argument: string | undefined): ModelSelection | undefined {
  if (!argument) return undefined;
  let reference = argument;
  let thinking: ModelSelection["thinking"];
  const colon = reference.lastIndexOf(":");
  if (colon > 0 && THINKING_LEVELS.includes(reference.slice(colon + 1) as never)) {
    thinking = reference.slice(colon + 1) as ModelSelection["thinking"];
    reference = reference.slice(0, colon);
  }
  const slash = reference.indexOf("/");
  if (slash <= 0 || slash === reference.length - 1) return undefined;
  const selection: ModelSelection = {
    provider: reference.slice(0, slash),
    model: reference.slice(slash + 1),
  };
  if (thinking) selection.thinking = thinking;
  return selection;
}

function buildLaunchProfile(input: LaunchProfileInput): LaunchProfile {
  return subagentExecution.buildLaunchProfile(input);
}

interface SubagentToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

interface SubagentResumeParams {
  sessionPath: string;
  name?: string;
  message?: string;
  autoExit?: boolean;
  model?: string;
}

async function executeSubagentResume(
  pi: ExtensionAPI,
  params: SubagentResumeParams,
  ctx: LaunchContext & Parameters<typeof resolveModelPolicy>[1],
): Promise<SubagentToolResult> {
  return subagentExecution.executeSubagentResume(pi, params, ctx);
}

/**
 * Task-runtime policy for pi-tasks RPC launches (see pi-tasks-rpc.ts).
 *
 * Internal only — never exposed through the public `Agent` tool schema.
 * A task launch is always autonomous regardless of profile defaults: forced
 * non-interactive and auto-exiting (defense in depth for the pi-tasks
 * contract), with an optional validated turn limit exported to the child as
 * `PI_SUBAGENT_MAX_TURNS`.
 */
interface TaskRuntimeOptions {
  maxTurns?: number;
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

const ASYNC_TOOL_CONTRACT =
  "This is a fire-and-forget async tool: the call returns immediately with only an acknowledgement. " +
  "When the sub-agent finishes, the harness AUTOMATICALLY delivers its result as a steer message that wakes you up and starts a new turn — you do not need to do anything to receive it. " +
  "DO NOT write polling loops, sleep/wait commands, tail/watch scripts, or repeatedly read session/log files to detect completion. DO NOT call ListAgents or any other tool to 'check' status. All of that is wasted work — the harness handles delivery for you. " +
  "DO NOT fabricate, assume, or summarize results after calling this tool. " +
  "After spawning, either end your turn immediately, or work on other independent tasks (including spawning more subagents in parallel). The harness will wake you with the result when it is ready.";

const SUBAGENT_TOOL_DESCRIPTION = "Spawn a sub-agent in a dedicated tmux pane. " + ASYNC_TOOL_CONTRACT;

const SUBAGENT_RESUME_DESCRIPTION =
  "Resume a previous sub-agent session in a new tmux pane. " +
  ASYNC_TOOL_CONTRACT +
  " Use when a sub-agent was cancelled or needs follow-up work. " +
  "When the saved session is at or above 65% of the selected model's context window, a gate offers " +
  "a fresh same-role rollover, resume anyway, another model, or stop; model selection shows the projected context ratio per model.";

const SUBAGENT_INTERRUPT_DESCRIPTION =
  "Send Escape to the active turn of a currently running Pi-backed subagent. " +
  "The child pane, session, watcher, and running entry remain alive; this returns only a local acknowledgement " +
  "and does not emit a subagent_result solely because of this request.";

const SUBAGENTS_LIST_DESCRIPTION =
  "List all available subagent definitions. " +
  "Scans the bundled agents, global ~/.pi/agent/agents/, and project-local .pi/agents/. " +
  "Later sources override earlier ones with the same name.";

type ToolRenderResult = {
  content?: Array<{ type?: string; text?: string }>;
  details?: unknown;
};

function renderToolStateRow(
  theme: UiTheme,
  input: {
    name: string;
    role?: string;
    state: SemanticState;
    label: string;
    metadata?: string;
  },
): string {
  const metadata = input.metadata
    ? `${formatSeparator(theme)}${formatMetadata(theme, input.metadata)}`
    : "";
  return `${formatIdentity(theme, input.name, input.role)}${metadata}${formatSeparator(theme)}${formatState(theme, input.state, { label: input.label })}`;
}

function renderToolFallback(result: ToolRenderResult, theme: UiTheme): Text {
  const details =
    result.details != null && typeof result.details === "object"
      ? result.details as { error?: unknown }
      : undefined;
  const first = result.content?.[0];
  const text = sanitizeDisplayText(
    first?.type === "text" && typeof first.text === "string" ? first.text : "",
  );
  const failed = details?.error != null;
  const state = failed ? "failed" : "completed";
  const body = span(theme, failed ? "error" : "toolOutput", text);
  return new Text(
    `${formatState(theme, state)}${text ? `${formatSeparator(theme)}${body}` : ""}`,
    0,
    0,
  );
}

/** Adapt legacy service results at the active tool boundary, not notice callbacks. */
function activeAgentResult<T extends { details: unknown; isError?: boolean }>(result: T): T {
  const details = result.details as { error?: unknown; exitCode?: number } | undefined;
  return details?.error != null || (details?.exitCode != null && details.exitCode !== 0)
    ? { ...result, isError: true }
    : result;
}

export default function piTmuxSubagents(pi: ExtensionAPI): void {
  retiredToolFixtures.clear();
  const finishedOrdinary = new Map<string, FinishedOrdinaryAgent>();
  const followUpsInFlight = new Set<string>();
  let sessionEpoch = 0;
  let sessionActive = true;
  const deniedTools = new Set(
    (process.env.PI_DENY_TOOLS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const memberEnv = {
    directory: process.env.PI_TEAM_DIRECTORY,
    teamId: process.env.PI_TEAM_ID,
    memberId: process.env.PI_TEAM_MEMBER_ID,
    token: process.env.PI_TEAM_MEMBER_TOKEN,
    sessionId: process.env.PI_TEAM_CHILD_SESSION_ID,
    leadSessionId: process.env.PI_TEAM_LEAD_SESSION_ID,
    epoch: Number(process.env.PI_TEAM_MEMBER_EPOCH),
  };
  const memberMailbox = memberEnv.directory && memberEnv.teamId && memberEnv.memberId &&
    memberEnv.token && memberEnv.sessionId && memberEnv.leadSessionId &&
    Number.isSafeInteger(memberEnv.epoch) && memberEnv.epoch > 0
      ? createMemberMailbox({
        directory: memberEnv.directory, teamId: memberEnv.teamId,
        leadSessionId: memberEnv.leadSessionId,
        member: {
          memberId: memberEnv.memberId, sessionId: memberEnv.sessionId,
          token: memberEnv.token, epoch: memberEnv.epoch,
        },
      })
      : undefined;
  const shouldRegister = (name: string) => !deniedTools.has(name) ||
    (Boolean(memberMailbox) && (name === "SendMessage" || name === "ListAgents"));
  // pi-tasks captures this override at factory time; later environment changes
  // cannot change its active task file.
  const capturedPiTasks = process.env.PI_TASKS;
  const leadIncarnation = randomUUID();
  let leadReceipt: LeadReceipt | undefined;
  let coordinator: TeamCoordinator | undefined;
  const answers = new Map<string, ApprovalResponse>();
  const invalidatedApprovals = new Set<string>();
  const invalidateApprovals = (): void => {
    for (const requestId of answers.keys()) invalidatedApprovals.add(requestId);
    answers.clear();
  };
  pi.on("session_start", (event, ctx) => {
    sessionActive = true;
    if (event.reason === "new" || event.reason === "resume" || event.reason === "fork") {
      sessionEpoch++;
      finishedOrdinary.clear();
      followUpsInFlight.clear();
    }
    latestCtx = ctx;
    const start = recordLeadStart({
      cwd: ctx.cwd,
      agentDir: getAgentConfigDir(),
      sessionId: ctx.sessionManager.getSessionId(),
      sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
      piTasks: capturedPiTasks,
    }, { reason: event.reason, incarnation: leadIncarnation });
    leadReceipt = start.ok ? start.value : undefined;
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
    leadReceipt = undefined;
    answers.clear();
    invalidatedApprovals.clear();
    leadRecoveries.clear();
    coordinator?.close();
    coordinator = undefined;
    sessionEpoch++;
    sessionActive = false;
    finishedOrdinary.clear();
    followUpsInFlight.clear();
    shutdownWorkflowProvider();
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
    const moduleAbort = globalState[POLL_ABORT_KEY] as AbortController | undefined;
    if (moduleAbort) moduleAbort.abort();
    for (const agent of runningSubagents.values()) {
      agent.abortController?.abort();
    }
    // Task panes never survive the parent session: unsubscribe the handlers,
    // terminate adapter-owned panes, and clear the task-run records.
    shutdownPiTasksRpcBridge();
    runningSubagents.clear();
  });

  const openCoordinator = async (
    ctx: ExtensionContext, teamName?: string, taskFingerprint?: string,
  ): Promise<TeamCoordinator> => {
    if (!coordinator) {
      coordinator = await TeamCoordinator.open({
        directory: join(ctx.sessionManager.getSessionDir(), "artifacts", ctx.sessionManager.getSessionId(), "team"),
        leadSessionId: ctx.sessionManager.getSessionId(),
        teamName,
        taskFingerprint,
        onNotice: async ({ memberName, memberId, memberEpoch, memberSessionId, message }) => {
          if (message.kind === "approval_request") {
            const request = JSON.parse(message.body) as ApprovalRequest;
            if (request.requestId !== message.requestId || request.memberId !== memberId ||
                request.memberEpoch !== memberEpoch || request.memberSessionId !== memberSessionId ||
                request.leadSessionId !== ctx.sessionManager.getSessionId() ||
                !verifyApprovalRequest(request)) {
              throw new Error("Uncorrelated teammate approval request");
            }
            if (invalidatedApprovals.has(request.requestId)) {
              // The original response can already be in the mailbox. Never
              // approve this request again against a changed task baseline.
              return;
            }
            let answer = answers.get(request.requestId);
            if (!answer) {
              let approved = false;
              const fullInput = canonicalCall(request.input);
              if (ctx.mode === "tui" && ctx.hasUI && fullInput.length <= 4096) {
                approved = await ctx.ui.confirm(
                  `Approve ${memberName}'s exact ${request.toolName} call?`,
                  `Member: ${memberName} (${memberId}, epoch ${memberEpoch})\n` +
                  `Tool call: ${request.toolCallId}\nDigest: ${request.digest}\nInput: ${fullInput}`,
                );
              }
              answer = answerApproval(request, approved);
              answers.set(request.requestId, answer);
            }
            await coordinator!.transport.sendFromLead({
              teamId: coordinator!.teamId, to: memberId,
              requestId: request.requestId, kind: "approval_response",
              body: JSON.stringify(answer),
            });
            return;
          }
          if (message.kind === "result") {
            let receipt: {
              type?: string; approvalRequestId?: string; digest?: string;
              toolCallId?: string; previous?: string; next?: string;
            } | undefined;
            try { receipt = JSON.parse(message.body); } catch { /* ordinary result notice */ }
            if (receipt?.type === "task_commit") {
              const granted = receipt.approvalRequestId
                ? answers.get(receipt.approvalRequestId) : undefined;
              const current = checkLeadAdmission({
                cwd: ctx.cwd, agentDir: getAgentConfigDir(),
                sessionId: ctx.sessionManager.getSessionId(),
                sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
                piTasks: capturedPiTasks,
              }, leadReceipt);
              if (!granted?.approved || granted.memberId !== memberId ||
                  granted.memberEpoch !== memberEpoch || granted.digest !== receipt.digest ||
                  granted.toolCallId !== receipt.toolCallId || !receipt.previous || !receipt.next ||
                  !current.ok || current.value.storeFingerprint !== receipt.next) {
                await coordinator!.transport.pauseTaskWrites(coordinator!.teamId,
                  "Uncorrelated or conflicting teammate task commit");
                throw new Error("Team task commit could not be correlated; writes paused");
              }
              await coordinator!.transport.recordTaskCommit({
                teamId: coordinator!.teamId, memberId, epoch: memberEpoch,
                previous: receipt.previous, next: receipt.next,
              });
              answers.delete(receipt.approvalRequestId!);
              return;
            }
          }
          if (message.kind === "message" || message.kind === "idle" ||
              message.kind === "result" || message.kind === "error") {
            pi.sendMessage({
              customType: "teammate_notice",
              content: `${memberName}: ${message.body}`,
              display: true,
              details: { name: memberName, kind: message.kind, memberId: message.from },
            }, { triggerTurn: true, deliverAs: "steer" });
          }
        },
      });
    } else if (teamName && await coordinator.transport.getTeamName(coordinator.teamId) !== teamName) {
      throw new Error("This lead session already owns a differently named team");
    }
    return coordinator;
  };

  const existingCoordinator = async (ctx: ExtensionContext): Promise<TeamCoordinator | undefined> => {
    if (coordinator) return coordinator;
    const roster = join(ctx.sessionManager.getSessionDir(), "artifacts",
      ctx.sessionManager.getSessionId(), "team", "main", "roster.json");
    return existsSync(roster) ? openCoordinator(ctx) : undefined;
  };
  const stopTeamMember = async (ctx: ExtensionContext, id: string, signal?: AbortSignal): Promise<string> => {
    if (memberMailbox) throw new Error("Only the owning lead session can stop teammates");
    if (signal?.aborted) throw new Error("Teammate stop cancelled");
    const team = await existingCoordinator(ctx);
    if (!team) throw new Error("No team belongs to this lead session");
    if (!sessionActive || team.leadSessionId !== ctx.sessionManager.getSessionId()) {
      throw new Error("Only the owning active lead session can stop teammates");
    }
    const member = (await team.transport.listMembers(team.teamId))
      .find((entry) => entry.memberId === id && entry.state === "active");
    if (!member || !member.surface || !member.sessionFile) {
      throw new Error("Teammate is absent, stale or has no owned pane");
    }
    // Cancellation is safe until the pane close; once stopped, finish roster cleanup.
    if (signal?.aborted) throw new Error("Teammate stop cancelled");
    closeSurface(member.surface);
    const running = [...runningSubagents.values()].find((entry) =>
      entry.team?.memberId === member.memberId && entry.team.epoch === member.epoch);
    if (running) {
      running.abortController?.abort();
      runningSubagents.delete(running.id);
    }
    await team.transport.stopMember({
      teamId: team.teamId, memberId: member.memberId, epoch: member.epoch,
    });
    return `Teammate ${member.name} (team:${member.memberId}) stopped successfully`;
  };
  if (!memberMailbox && shouldRegister("TeamStop"))
    pi.registerTool({
      name: "TeamStop",
      label: "Stop Teammate",
      exposure: "direct",
      description: "Fully stop an active teammate owned by this lead session. " +
        'Use task_id: "team:<member UUID>". AgentInterrupt stops only the current turn; TaskStop is for native tasks.',
      parameters: Type.Object({
        task_id: Type.String({ description: "Qualified teammate ID: team:<member UUID>" }),
      }),
      async execute(_toolCallId, params, signal, _onUpdate, ctx) {
        try {
          if (!/^team:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.task_id)) {
            throw new Error('Use a qualified teammate ID: "team:<member UUID>"');
          }
          const text = await stopTeamMember(ctx, params.task_id.slice("team:".length), signal);
          return {
            isError: false,
            content: [{ type: "text" as const, text }],
            details: { teamStop: true },
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            isError: true,
            content: [{ type: "text" as const, text: `Teammate stop refused: ${message}` }],
            details: { teamStop: true, error: message },
          };
        }
      },
    });
  const leadRecoveries = new Map<string, {
    storeFingerprint: string;
    completed: Array<{ id: string; blocks: string[]; blockedBy: string[] }>;
  }>();
  pi.on("tool_call", async (event, ctx) => {
    if (!memberMailbox && event.toolName === "TaskCreate" && coordinator) {
      const disk = checkLeadAdmission({
        cwd: ctx.cwd, agentDir: getAgentConfigDir(),
        sessionId: ctx.sessionManager.getSessionId(),
        sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
        piTasks: capturedPiTasks,
      }, leadReceipt);
      if (disk.ok && disk.value.tasks.length > 0 &&
          disk.value.tasks.every((task) => task.status === "completed")) {
        leadRecoveries.set(event.toolCallId, {
          storeFingerprint: disk.value.storeFingerprint,
          completed: disk.value.tasks.map((task) => ({
            id: task.id, blocks: [...task.blocks], blockedBy: [...task.blockedBy],
          })),
        });
      }
    }
    if (event.toolName !== "TaskStop") return;
    const args = event.input as { task_id?: unknown; shell_id?: unknown };
    const taskId = args.task_id ?? args.shell_id;
    if (typeof taskId !== "string" || !taskId.startsWith("team:")) return;
    // Block without side effects: nested blocked calls have no message_end.
    return { block: true, reason:
      'Qualified teammate IDs are not supported by TaskStop. Use TeamStop with task_id: "team:<member UUID>" from the owning lead session. No teammate was stopped.' };
  });
  pi.on("tool_result", async (event, ctx) => {
    if (memberMailbox || event.toolName !== "TaskStop" || !event.isError) return;
    const id = event.input.task_id ?? event.input.shell_id;
    if (typeof id !== "string" || id.startsWith("team:") ||
        event.content.length !== 1 || event.content[0]?.type !== "text" ||
        event.content[0].text !== `No running background process for task ${id}`) return;
    const team = await existingCoordinator(ctx);
    if (!team || !(await team.transport.listMembers(team.teamId))
      .some((member) => member.memberId === id && member.state === "active")) return;
    try {
      const text = await stopTeamMember(ctx, id);
      return {
        isError: false,
        content: [{ type: "text" as const, text }],
        details: { teamStop: true, nativeAbsence: true },
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Teammate stop refused: ${error instanceof Error ? error.message : String(error)}` }],
      };
    }
  });
  pi.on("tool_result", async (event, ctx) => {
    if (memberMailbox || !coordinator || !["TaskCreate", "TaskUpdate", "TaskExecute", "TaskStop"].includes(event.toolName)) {
      return;
    }
    const disk = checkLeadAdmission({
      cwd: ctx.cwd, agentDir: getAgentConfigDir(),
      sessionId: ctx.sessionManager.getSessionId(),
      sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
      piTasks: capturedPiTasks,
    }, leadReceipt);
    const state = await coordinator.transport.getTaskState(coordinator.teamId);
    const recovery = leadRecoveries.get(event.toolCallId);
    leadRecoveries.delete(event.toolCallId);
    if (recovery && !event.isError && disk.ok && state.fingerprint === recovery.storeFingerprint &&
        disk.value.tasks.some((task) => task.status === "pending") &&
        recovery.completed.every((before) => {
          const after = disk.value.tasks.find((task) => task.id === before.id);
          return after?.status === "completed" &&
            JSON.stringify(after.blocks) === JSON.stringify(before.blocks) &&
            JSON.stringify(after.blockedBy) === JSON.stringify(before.blockedBy);
        })) {
      await coordinator.transport.recordLeadRecovery({
        teamId: coordinator.teamId, previous: recovery.storeFingerprint,
        next: disk.value.storeFingerprint,
      });
      invalidateApprovals();
      return;
    }
    if (disk.ok && state.fingerprint === disk.value.storeFingerprint) return;
    invalidateApprovals();
    if (disk.ok && !state.pauseReason && (!recovery || !event.isError)) {
      try {
        await coordinator.transport.recordObservedTaskChange({
          teamId: coordinator.teamId,
          previous: state.fingerprint ?? "",
          next: disk.value.storeFingerprint,
        });
        return;
      } catch { /* another team commit or unsafe hold won the roster lock */ }
    }
    if (disk.ok && state.pauseReason === LEGACY_NATIVE_TASK_HOLD && !recovery) {
      try {
        await coordinator.transport.recordObservedTaskChange({
          teamId: coordinator.teamId,
          previous: state.fingerprint ?? "",
          next: disk.value.storeFingerprint,
        });
        return;
      } catch { /* leave a conflicting hold in place */ }
    }
    const reason = !disk.ok ? disk.reason : recovery
      ? "Lead pending-task recovery did not retain completed history or had an uncertain result"
      : "Uncorrelated task change or commit";
    await coordinator.transport.pauseTaskWrites(coordinator.teamId, reason);
    if (!state.pauseReason) {
      pi.sendMessage({
        customType: "teammate_notice",
        content: `Team task writes paused: ${reason}. Resolve the unsafe or uncertain state before starting a fresh team session.`,
        display: true,
      }, { triggerTurn: true, deliverAs: "steer" });
    }
  });

  const ordinaryTool = defineTool({
      name: "subagent",
      label: "Subagent",
      description: SUBAGENT_TOOL_DESCRIPTION,
      promptSnippet: SUBAGENT_TOOL_DESCRIPTION,
      parameters: SubagentParams,

      async execute(_toolCallId, rawParams, signal, _onUpdate, ctx) {
        const params = normalizeSubagentParams(rawParams);
        const { followUpName, followUpLifecycle } = rawParams as SubagentParamsType & OrdinaryFollowUp;
        const launchEpoch = sessionEpoch;
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
        if (!sessionActive || sessionEpoch !== launchEpoch) {
          subagentExecution.stopSubagent(running);
          throw new Error("Agent launch interrupted by session navigation; the child was stopped.");
        }

        const rememberFinished = (result: SubagentResult): void => {
          if (!sessionActive || sessionEpoch !== launchEpoch) return;
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
          isOwned: () => sessionActive && sessionEpoch === launchEpoch,
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

      renderCall(args, theme) {
        const partialArgs = args as Record<string, unknown>;
        const name = typeof partialArgs.name === "string" && partialArgs.name ? partialArgs.name : "(unnamed)";
        const task = typeof partialArgs.task === "string" ? partialArgs.task : "";
        const agent = typeof partialArgs.agent === "string" ? partialArgs.agent : undefined;
        const cwd = typeof partialArgs.cwd === "string" && partialArgs.cwd
          ? `in ${partialArgs.cwd}`
          : undefined;
        let text = renderToolStateRow(theme, {
          name,
          role: agent,
          state: "starting",
          label: "pending",
          metadata: cwd,
        });

        if (task) {
          const taskLines = sanitizeDisplayText(task).split("\n");
          const firstLine = taskLines.find((line) => line.trim()) ?? "";
          const preview = truncateToWidth(firstLine, 100, "…");
          if (preview) {
            text += `\n${span(theme, "toolOutput", preview)}`;
          }
          const totalLines = taskLines.length;
          if (totalLines > 1) {
            text += ` ${formatMetadata(theme, `(${totalLines} lines)`)}`;
          }
        }

        return new Text(text, 0, 0);
      },

      renderResult(result, _opts, theme) {
        const details = result.details as { name?: string; status?: string } | undefined;
        const name = details?.name ?? "(unnamed)";

        if (details?.status === "started") {
          return new Text(
            renderToolStateRow(theme, {
              name,
              state: "starting",
              label: "started",
            }),
            0,
            0,
          );
        }

        return renderToolFallback(result, theme);
      },
    });
  retiredToolFixtures.set("subagent", ordinaryTool);

  if (shouldRegister("Agent"))
    pi.registerTool({
      name: "Agent",
      label: "Agent",
      exposure: "model-only",
      description: "Run a local agent in a tmux pane. Set run_in_background: false to await its result. " +
        'For Pi agents, set model: "inherit" (alias "parent") to use the parent session\'s active model and thinking level. ' +
        "This overrides agent defaults. " +
        'Only isolation: "worktree" creates a separate git worktree. ' +
        'Omitted isolation, "shared", and all other values use the shared working directory. ' +
        "Shared runs keep normal team-admission checks. " +
        "For background runs: " + ASYNC_TOOL_CONTRACT +
        " Eligible named interactive native agents use a team when admission gates allow it.",
      parameters: AgentParams,
      async execute(toolCallId, input, signal, onUpdate, ctx) {
        const params = normalizeAgentCall(input);
        const fail = (message: string) => ({
          isError: true,
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          details: { error: message },
        });
        if (signal?.aborted) return fail("Agent launch cancelled; no agent was started.");
        const unsupported = Object.keys(params).filter(
          (key) => !["description", "prompt", "subagent_type", "name", "run_in_background", "fork", "model", "isolation",
            "resume", "resumeSessionId",
            "systemPrompt", "skills", "tools", "cwd", "interactive", "max_turns", "team_name"].includes(key),
        );
        if (unsupported.length) {
          return fail(`Agent does not support ${unsupported.join(", ")}; no agent was started.`);
        }
        if (!params.description.trim() || !params.prompt.trim()) {
          return fail("Agent requires a non-empty description and prompt; no agent was started.");
        }
        if (params.max_turns !== undefined &&
            (!Number.isSafeInteger(params.max_turns) || params.max_turns < 1)) {
          return fail("Agent max_turns must be a positive integer; no agent was started.");
        }
        const agentName = params.subagent_type?.trim() || "general-purpose";
        const defaults = loadAgentDefaults(agentName);
        if (!defaults) return fail(`Agent definition "${agentName}" was not found; no agent was started.`);
        if (defaults.cli && (params.skills?.trim() || params.tools?.trim())) {
          return fail(`cli:${defaults.cli} does not support Agent skills or tools overrides; no agent was started.`);
        }
        if (defaults.cli && params.fork) {
          return fail(`cli:${defaults.cli} cannot inherit a Pi forked conversation; no agent was started.`);
        }
        if (params.resume !== undefined || params.resumeSessionId !== undefined) {
          if (params.fork || (params.resume !== undefined && params.resumeSessionId !== undefined) ||
              !(params.resume ?? params.resumeSessionId)?.trim()) {
            return fail("Agent resume requires one non-empty session reference without fork; no agent was started.");
          }
          if (!defaults.cli && (params.resumeSessionId !== undefined || !isAbsolute(params.resume!))) {
            return fail("Pi Agent resume requires an absolute saved session path; no agent was started.");
          }
        }
        if (params.max_turns !== undefined &&
            (defaults.cli || resolveEffectiveInteractive({
              name: params.name?.trim() || params.description,
              task: params.prompt, interactive: params.interactive,
            }, defaults))) {
          return fail("Agent max_turns is supported only for autonomous Pi runs; no agent was started.");
        }
        if (params.team_name !== undefined &&
            (defaults.cli || !params.team_name.trim() ||
             !params.name?.trim() ||
             ctx.mode !== "tui" || params.fork || params.isolation || params.resume ||
             params.interactive === false)) {
          return fail(defaults.cli
            ? `cli:${defaults.cli} runs as an ordinary agent only; team promotion is unavailable.`
            : "An explicit team needs a team name and an eligible named interactive native Agent.");
        }
        if (params.name?.trim() && !params.fork && !params.isolation && !params.resume && !memberMailbox &&
            ctx.mode === "tui" && !defaults.cli &&
            resolveEffectiveInteractive({
              name: params.name.trim(), task: params.prompt, interactive: params.interactive,
            }, defaults)) {
          const admission = checkLeadAdmission({
            cwd: ctx.cwd,
            agentDir: getAgentConfigDir(),
            sessionId: ctx.sessionManager.getSessionId(),
            sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
            piTasks: capturedPiTasks,
          }, leadReceipt);
          if (!admission.ok) {
            return fail(`Team admission blocked: ${admission.reason}. Configure autoClearCompleted: "never" and reload if needed; ordinary unnamed or explicitly noninteractive delegation remains available.`);
          }
          const name = params.name.trim();
          const resolved = resolveSubagentPaths({
            name, task: params.prompt, agent: agentName, cwd: params.cwd,
          }, defaults);
          const childCwd = resolved.effectiveCwd ?? ctx.cwd;
          const childSessionId = randomUUID();
          const childSessionFile = join(
            getDefaultSessionDirFor(childCwd, resolved.effectiveAgentDir),
            `${childSessionId}.jsonl`,
          );
          const childInput = {
            cwd: childCwd, agentDir: resolved.effectiveAgentDir,
            sessionId: childSessionId, sessionFile: childSessionFile,
            piTasks: admission.value.path,
          };
          const preflight = preflightTeamChild(admission.value, childInput);
          if (!preflight.ok) return fail(`Teammate startup blocked: ${preflight.reason}`);
          if (params.run_in_background === false) {
            return fail("An interactive teammate stays available for messages; use a background Agent call.");
          }
          if (!isTmuxAvailable()) return activeAgentResult(muxUnavailableResult());
          const opened = await openCoordinator(ctx, params.team_name?.trim(), admission.value.storeFingerprint);
          await opened.requireTaskFingerprint(admission.value.storeFingerprint);
          const member = await opened.addMember({ name, sessionId: childSessionId });
          const spec: TeamLaunchSpec = {
            directory: opened.directory, teamId: opened.teamId,
            memberId: member.memberId, memberToken: member.token, memberEpoch: member.epoch,
            childSessionId, childSessionFile, leadSessionId: ctx.sessionManager.getSessionId(),
            taskFile: admission.value.path,
            expectedStoreFingerprint: preflight.value.storeFingerprint,
            expectedConfigFingerprint: preflight.value.configFingerprint,
          };
          let running: RunningSubagent | undefined;
          try {
            running = await launchSubagent({
              name, task: params.prompt, agent: agentName, cwd: params.cwd,
              model: params.model, systemPrompt: params.systemPrompt,
              skills: params.skills, tools: params.tools, interactive: true,
            }, { ...ctx, pi }, { team: spec });
            await opened.transport.updateMemberRuntime({
              teamId: opened.teamId, memberId: member.memberId,
              surface: running.surface, sessionFile: running.sessionFile,
            });
            await opened.awaitStartup({
              memberId: member.memberId, memberEpoch: member.epoch,
              candidate: preflight.value,
              child: { ...childInput, sessionFile: running.sessionFile },
              signal, timeoutMs: 20_000,
            });
            subagentExecution.watchInBackground({
              pi, ctx, running,
              onSuccess: async ({ result }) => {
                try { await opened.transport.stopMember({
                  teamId: opened.teamId, memberId: member.memberId, epoch: member.epoch,
                }); } catch { /* a reloaded lead may own the roster now */ }
                return {
                  content: resolveResultPresentation(result, name),
                  details: { id: running!.id, name, team: opened.teamId, exitCode: result.exitCode },
                };
              },
              onError: async (message) => ({
                content: `Teammate "${name}" failed: ${message}`,
                details: { id: running!.id, name, error: message },
              }),
            });
            return {
              content: [{ type: "text" as const, text: `Teammate "${name}" started in team "${params.team_name ?? "main"}".` }],
              details: { id: running.id, name, memberId: member.memberId, team: opened.teamId, status: "started" },
            };
          } catch (error) {
            if (running) {
              try { subagentExecution.stopSubagent(running); } catch { /* retain an unclosed pane for diagnosis */ }
            }
            try { await opened.transport.stopMember({
              teamId: opened.teamId, memberId: member.memberId, epoch: member.epoch,
            }); } catch { /* report the original startup failure */ }
            return fail(`Teammate startup failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        if (params.resume && !defaults.cli) {
          if (params.run_in_background === false || params.isolation || params.cwd || params.skills ||
              params.tools || params.systemPrompt || params.interactive !== undefined || params.max_turns !== undefined) {
            return fail("Pi Agent resume restores saved controls; foreground and fresh-launch overrides are unavailable.");
          }
          return activeAgentResult(await executeSubagentResume(pi, {
            sessionPath: params.resume, name: params.name, message: params.prompt, model: params.model,
          }, ctx));
        }
        if (!params.name?.trim() && params.interactive !== true && defaults.autoExit !== true && !defaults.cli) {
          return fail(`Agent definition "${agentName}" needs auto-exit or interactive: true for an unnamed run; no agent was started.`);
        }
        const ordinaryParams: SubagentParamsType & { runInForeground?: boolean; isolation?: string; followUpName?: string } = {
          name: params.name?.trim() || params.description,
          task: params.prompt, agent: agentName, fork: params.fork,
          systemPrompt: params.systemPrompt, skills: params.skills, tools: params.tools, cwd: params.cwd, model: params.model,
          resumeSessionId: params.resume ?? params.resumeSessionId,
          ...(params.interactive !== undefined ? { interactive: params.interactive } : {}),
          runInForeground: params.run_in_background === false,
          ...(params.max_turns ? { maxTurns: params.max_turns } : {}),
          ...(params.isolation ? { isolation: params.isolation } : {}),
          ...(params.name?.trim() ? { followUpName: params.name.trim() } : {}),
        };
        return activeAgentResult(await ordinaryTool.execute(toolCallId, ordinaryParams, signal, onUpdate, ctx));
      },
    });

  if (shouldRegister("SendMessage"))
    pi.registerTool({
      name: "SendMessage",
      label: "Send Message",
      exposure: "model-only",
      description: "Send a message to the team lead or an active teammate, or follow up with a finished ordinary agent.",
      parameters: Type.Object({
        recipient: Type.String({ description: "Exact name of a finished ordinary agent" }),
        content: Type.String({ description: "Follow-up instruction" }),
        type: Type.Optional(Type.String({ description: "Message type (only message is supported for ordinary agents)" })),
      }),
      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        const fail = (error: string) => ({
          isError: true,
          content: [{ type: "text" as const, text: `Error: ${error}` }],
          details: { error },
        });
        if (_signal?.aborted) return fail("Message cancelled; no message or follow-up was sent.");
        if (params.type !== undefined && params.type !== "message") {
          return fail("Only ordinary follow-up messages are available; teammate control messages require team admission.");
        }
        const recipient = params.recipient.trim();
        if (!recipient || !params.content.trim()) return fail("Recipient and content must be non-empty.");
        if (memberMailbox) {
          if (ctx.sessionManager.getSessionId() !== memberEnv.sessionId) {
            return fail("Teammate session identity changed");
          }
          const message = recipient === "lead"
            ? await memberMailbox.sendToLead({ requestId: randomUUID(), body: params.content })
            : await memberMailbox.sendToMember({ recipient, requestId: randomUUID(), body: params.content });
          return {
            content: [{ type: "text" as const, text: `Message delivered to ${recipient}.` }],
            details: { id: message.id, status: "delivered", recipient },
          };
        }
        const activeCoordinator = await existingCoordinator(ctx);
        if (activeCoordinator) {
          const teammate = await activeCoordinator.findMember(recipient);
          if (teammate) {
            const admission = checkLeadAdmission({
              cwd: ctx.cwd, agentDir: getAgentConfigDir(),
              sessionId: ctx.sessionManager.getSessionId(),
              sessionFile: ctx.sessionManager.getSessionFile() ?? undefined,
              piTasks: capturedPiTasks,
            }, leadReceipt);
            if (!admission.ok) return fail(`Teammate messaging paused: ${admission.reason}`);
            const message = await activeCoordinator.send(recipient, params.content);
            return {
              content: [{ type: "text" as const, text: `Message delivered to ${recipient}.` }],
              details: { id: message.id, status: "delivered", recipient },
            };
          }
        }
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
        const launchEpoch = sessionEpoch;
        const isOwned = () => sessionActive && sessionEpoch === launchEpoch;
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
                onResult: ({ result }) => {
                  onResult();
                  if (result.exitCode === 0 && !result.error && result.sessionFile) {
                    finishedOrdinary.set(recipient, { backend: "pi", id: saved.id, sessionPath: result.sessionFile });
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
      },
    });

  if (shouldRegister("ListAgents"))
    pi.registerTool({
      name: "ListAgents",
      label: "List Agents",
      description: "List locally tracked running and finished ordinary agents. Team members appear only after team admission.",
      parameters: Type.Object({}),
      outputSchema: Type.Object({
        agents: Type.Array(Type.Object({
          id: Type.String(),
          name: Type.String(),
          status: Type.String(),
          agent: Type.Optional(Type.String()),
          epoch: Type.Optional(Type.Integer()),
        })),
      }),
      async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
        const activeCoordinator = memberMailbox ? undefined : await existingCoordinator(ctx);
        const teammates = memberMailbox
          ? (await memberMailbox.listMembers()).map((member) => ({
            id: member.memberId, name: member.name, status: member.state, epoch: member.epoch,
          }))
          : activeCoordinator
            ? (await activeCoordinator.transport.listMembers(activeCoordinator.teamId)).map((member) => ({
              id: member.memberId, name: member.name, status: member.state, epoch: member.epoch,
            }))
            : [];
        const agents = [
          ...teammates,
          ...[...runningSubagents.values()].map((agent) => ({
            ...(agent.team ? { team: agent.team.teamId } : {}),
            id: agent.id, name: agent.name, agent: agent.agent, status: "running" as const,
          })).filter((agent) => !("team" in agent)),
          ...[...finishedOrdinary.entries()].map(([name, agent]) => ({
            id: agent.id, name, status: "finished" as const,
          })),
        ];
        const structuredAgents = agents.map((agent) => {
          const record: Record<string, string | number> = {
            id: agent.id, name: agent.name, status: agent.status,
          };
          if ("agent" in agent && agent.agent !== undefined) record.agent = agent.agent;
          if ("epoch" in agent) record.epoch = agent.epoch;
          return record;
        });
        return {
          content: [{ type: "text" as const, text: agents.length
            ? agents.map(({ name, id, status }) => `${name} (${id}): ${status}`).join("\n")
            : "No agents in this session." }],
          details: { agents },
          structuredContent: { agents: structuredAgents },
        };
      },
    });

  if (shouldRegister("AgentInterrupt"))
    pi.registerTool({
      name: "AgentInterrupt",
      label: "Interrupt Agent",
      description: SUBAGENT_INTERRUPT_DESCRIPTION,
      parameters: Type.Object({
        id: Type.Optional(Type.String({ description: "Running agent ID" })),
        name: Type.Optional(Type.String({ description: "Exact running agent name" })),
      }),
      async execute(_toolCallId, params) {
        return handleSubagentInterrupt(params);
      },
    });

  if (shouldRegister("subagent_interrupt"))
    retiredToolFixtures.set("subagent_interrupt", defineTool({
      name: "subagent_interrupt",
      label: "Interrupt Subagent",
      description: SUBAGENT_INTERRUPT_DESCRIPTION,
      promptSnippet: SUBAGENT_INTERRUPT_DESCRIPTION,
      parameters: Type.Object({
        id: Type.Optional(
          Type.String({ description: "Running subagent id (8 hex chars from the subagent tool result details.id). Omit when using name." }),
        ),
        name: Type.Optional(
          Type.String({ description: "Exact running subagent display name as passed to the subagent tool (for example \"Scout\")." }),
        ),
      }),

      async execute(_toolCallId, params) {
        return handleSubagentInterrupt(params);
      },

      renderCall(args, theme) {
        const target = args.id ? `${args.id}` : args.name ?? "(unknown)";
        return new Text(
          renderToolStateRow(theme, {
            name: target,
            state: "help",
            label: "interrupt turn",
          }),
          0,
          0,
        );
      },

      renderResult(result, _opts, theme) {
        const details = result.details as { status?: string; name?: string; id?: string } | undefined;
        if (details?.status === "interrupt_requested") {
          return new Text(
            renderToolStateRow(theme, {
              name: details.name ?? details.id ?? "subagent",
              state: "help",
              label: "interrupt requested",
            }),
            0,
            0,
          );
        }

        return renderToolFallback(result, theme);
      },
    }));

  if (shouldRegister("subagents_list"))
    retiredToolFixtures.set("subagents_list", defineTool({
      name: "subagents_list",
      label: "List Subagents",
      description: SUBAGENTS_LIST_DESCRIPTION,
      promptSnippet: SUBAGENTS_LIST_DESCRIPTION,
      parameters: Type.Object({}),

      async execute() {
        const list = discoverAgentDefinitions().filter((agent) => !agent.disableModelInvocation);

        if (list.length === 0) {
          return {
            content: [{ type: "text", text: "No subagent definitions found." }],
            details: { agents: [] },
          };
        }

        const lines = list.map((a) => {
          const badge = a.source === "project" ? " (project)" : "";
          const desc = a.description ? ` — ${a.description}` : "";
          const model = a.model ? ` [${a.model}]` : "";
          return `• ${a.name}${badge}${model}${desc}`;
        });

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { agents: list },
        };
      },

      renderResult(result, _opts, theme) {
        const details = result.details as { agents?: ListedAgentDefinition[] } | undefined;
        const agents = details?.agents ?? [];
        if (agents.length === 0) {
          return new Text(
            `${formatState(theme, "completed", { glyphOnly: true })}${formatSeparator(theme)}${formatMetadata(theme, "No subagent definitions found.")}`,
            0,
            0,
          );
        }
        const lines = agents.map((agent, index) => {
          const state = index === 0
            ? `${formatState(theme, "completed", { glyphOnly: true })}${formatSeparator(theme)}`
            : "  ";
          const badge = agent.source === "project"
            ? span(theme, "accent", " (project)")
            : "";
          const model = agent.model
            ? ` ${formatMetadata(theme, `[${sanitizeDisplayLine(agent.model)}]`)}`
            : "";
          const description = agent.description
            ? ` ${formatMetadata(theme, `— ${sanitizeDisplayLine(agent.description)}`)}`
            : "";
          return `${state}${formatIdentity(theme, agent.name)}${badge}${model}${description}`;
        });
        return new Text(lines.join("\n"), 0, 0);
      },
    }));

  if (shouldRegister("subagent_resume"))
    retiredToolFixtures.set("subagent_resume", defineTool({
      name: "subagent_resume",
      label: "Resume Subagent",
      description: SUBAGENT_RESUME_DESCRIPTION,
      promptSnippet: SUBAGENT_RESUME_DESCRIPTION,
      parameters: Type.Object({
        sessionPath: Type.String({ description: "Path to the session .jsonl file to resume" }),
        name: Type.Optional(
          Type.String({ description: "Display name for the pane. Default: 'Resume'" }),
        ),
        message: Type.Optional(
          Type.String({
            description: "Optional message to send after resuming (e.g. follow-up instructions)",
          }),
        ),
        autoExit: Type.Optional(
          Type.Boolean({
            description:
              "Whether the resumed session should automatically exit after completing its response. Defaults to true for autonomous follow-up work; set false for interactive resumed sessions.",
          }),
        ),
        model: Type.Optional(
          Type.String({
            description:
              "Model policy for the resumed session: 'previous' (default; the sidecar's last successful model), 'parent', 'pick', or an explicit 'provider/model[:thinking]' value. Sessions without a launch-profile sidecar keep the legacy behavior when this is omitted.",
          }),
        ),
      }),

      renderCall(args, theme) {
        const name = args.name ?? "Resume";
        return new Text(
          renderToolStateRow(theme, {
            name,
            state: "starting",
            label: "resuming session",
          }),
          0,
          0,
        );
      },

      renderResult(result, _opts, theme) {
        const details = result.details as
          | { name?: string; status?: string; rollover?: string }
          | undefined;
        const name = details?.name ?? "Resume";

        if (details?.status === "started") {
          return new Text(
            renderToolStateRow(theme, {
              name,
              state: "starting",
              label: details?.rollover === "fresh" ? "fresh rollover started" : "resumed",
            }),
            0,
            0,
          );
        }

        return renderToolFallback(result, theme);
      },

      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        return executeSubagentResume(pi, params, ctx);
      },
    }));

  pi.registerCommand("subtask", {
    description: "Fork session into a subagent for focused work (bugfixes, iteration)",
    handler: async (args) => {
      const task = args.trim() || "";
      const taskText = task || "The user wants to do some hands-on work. Help them with whatever they need.";
      const toolCall =
        `Use Agent to fork a session. fork: true, description: "Subtask", prompt: ${JSON.stringify(taskText)}. ` +
        "Do not set name, subagent_type, tools, skills, or model.";
      pi.sendUserMessage(toolCall);
    },
  });

  pi.registerCommand("subagent", {
    description: "Spawn a subagent: /subagent <agent> <task>",
    handler: async (args, ctx) => {
      const trimmed = args.trim();
      if (!trimmed) {
        ctx.ui.notify("Usage: /subagent <agent> [task]", "warning");
        return;
      }

      const spaceIdx = trimmed.indexOf(" ");
      const agentName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
      const task = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

      const defs = loadAgentDefaults(agentName);
      if (!defs) {
        ctx.ui.notify(
          `Agent "${agentName}" not found in the bundled agents, ~/.pi/agent/agents/, or .pi/agents/`,
          "error",
        );
        return;
      }

      const taskText = task || `You are the ${agentName} agent. Wait for instructions.`;
      const displayName = agentName[0].toUpperCase() + agentName.slice(1);
      const toolCall = `Use Agent with description: ${JSON.stringify(`${agentName}: ${taskText}`)}, ` +
        `subagent_type: ${JSON.stringify(agentName)}, name: ${JSON.stringify(displayName)}, ` +
        `prompt: ${JSON.stringify(taskText)}`;
      pi.sendUserMessage(toolCall);
    },
  });

  pi.registerCommand("agent-models", {
    description: "Set or clear per-agent default models (agent-models.json)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/agent-models needs interactive UI.", "warning");
        return;
      }
      await manageAgentModels(ctx);
    },
  });

  pi.registerMessageRenderer("subagent_result", (message, options, theme) => {
    const details = message.details as
      | {
          name?: string;
          exitCode?: number;
          errorMessage?: string;
          error?: string;
          elapsed?: number;
          agent?: string;
          sessionFile?: string;
          usage?: SubagentUsageSummary;
        }
      | undefined;
    if (!details) return undefined;

    return {
      invalidate() {},
      render(width: number): string[] {
        const name = details.name ?? "subagent";
        const exitCode = details.exitCode ?? 0;
        const errorMessage = typeof details.errorMessage === "string" ? details.errorMessage : "";
        const genericError = typeof details.error === "string" ? details.error : "";
        const failed = exitCode !== 0 || Boolean(errorMessage) || Boolean(genericError);
        const elapsed = details.elapsed == null ? "?" : formatElapsed(details.elapsed);
        const bgFn = failed
          ? (text: string) => theme.bg("toolErrorBg", text)
          : (text: string) => theme.bg("toolSuccessBg", text);
        const state = failed ? "failed" : "completed";
        const status = errorMessage
          ? "failed (provider/agent error)"
          : failed
            ? `failed (exit ${exitCode})`
            : "completed";
        const header =
          `${formatState(theme, state, { glyphOnly: true })} ` +
          `${formatIdentity(theme, name, details.agent)}` +
          `${formatSeparator(theme, "—")}` +
          `${formatStateLabel(theme, state, status)} ` +
          `${formatMetadata(theme, `(${elapsed})`)}`;
        // The compact usage/context-pressure line is rendered from
        // details.usage under the header, so the copy appended to the
        // model-visible content is stripped here to avoid duplication.
        const usageLine = formatUsageSummary(details.usage);
        const rawContent = typeof message.content === "string" ? message.content : "";

        const summary = sanitizeDisplayText(
          (usageLine
            ? rawContent
              .replace(/\n\nSession: .+\nResume: .+$/, "")
              .replace(/\n\nUsage: .+$/, "")
            : rawContent)
          .replace(/\n\nSession: .+\nResume: .+$/, "")
          .replace(`Sub-agent "${name}" completed (${elapsed}).\n\n`, "")
          .replace(`Sub-agent "${name}" failed (exit code ${exitCode}).\n\n`, "")
          .replace(
            new RegExp(
              `^Sub-agent "${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" failed after ${elapsed} \\(provider/agent error — auto-retry exhausted\\)\\.\\n\\n`,
            ),
            "",
          ),
        );
        const outputPad = Number.isFinite(options.outputPad)
          ? Math.max(0, Math.floor(options.outputPad))
          : 1;
        const lineWidth = Math.max(0, width - outputPad * 2);
        const contentLines = [truncateToWidth(header, lineWidth, "")];
        if (usageLine) {
          contentLines.push(truncateToWidth(span(theme, "dim", usageLine), lineWidth, ""));
        }
        const summaryLines = summary ? summary.split("\n") : [];

        if (options.expanded) {
          for (const line of summaryLines) {
            contentLines.push(truncateToWidth(line, lineWidth, ""));
          }
          if (details.sessionFile) {
            const sessionFile = sanitizeDisplayLine(details.sessionFile);
            contentLines.push("");
            contentLines.push(
              truncateToWidth(
                span(theme, "dim", `Session: ${sessionFile}`),
                lineWidth,
                "",
              ),
            );
            contentLines.push(
              truncateToWidth(
                span(theme, "dim", `Resume:  pi --session ${sessionFile}`),
                lineWidth,
                "",
              ),
            );
          }
        } else {
          const previewLines = summaryLines.slice(0, 5);
          for (const line of previewLines) {
            contentLines.push(
              truncateToWidth(span(theme, "dim", line), lineWidth, ""),
            );
          }
          if (summaryLines.length > 5) {
            contentLines.push(
              truncateToWidth(
                formatMetadata(theme, `… ${summaryLines.length - 5} more lines`),
                lineWidth,
                "",
              ),
            );
          }
          contentLines.push(
            truncateToWidth(
              formatKeyHint(theme, keyText("app.tools.expand"), "to expand"),
              lineWidth,
              "",
            ),
          );
        }

        const box = new Box(outputPad, 1, bgFn);
        box.addChild(new Text(contentLines.join("\n"), 0, 0));
        return ["", ...box.render(width)];
      },
    };
  });

  pi.registerMessageRenderer("subagent_status", (message, options, theme) => {
    const details = message.details as
      | { lines?: string[]; items?: StatusTransitionItem[]; overflow?: number }
      | undefined;
    const lines = Array.isArray(details?.lines) ? details.lines : [];
    const items = Array.isArray(details?.items) ? details.items : [];
    const overflow = typeof details?.overflow === "number" ? details.overflow : 0;
    if (items.length === 0 && lines.length === 0 && overflow === 0) return undefined;

    return {
      invalidate() {},
      render(width: number): string[] {
        const outputPad = Number.isFinite(options.outputPad)
          ? Math.max(0, Math.floor(options.outputPad))
          : 1;
        const lineWidth = Math.max(0, width - outputPad * 2);
        const contentLines = [
          truncateToWidth(
            `${span(theme, "accent", "●")} ${formatIdentity(theme, "Subagent status")}`,
            lineWidth,
            "",
          ),
        ];

        if (items.length > 0) {
          for (const item of items) {
            let state: SemanticState = item.kind;
            if (item.transition === "recovered") {
              state = item.kind === "waiting" ? "waiting" : "active";
            }

            const detailLabel =
              item.kind === "active"
                ? item.activityLabel ?? item.activeScope
                : item.statusLabel;
            const duration =
              item.kind === "active"
                ? item.activeDurationText
                : item.kind === "waiting"
                  ? item.waitingDurationText
                  : item.kind === "stalled"
                    ? item.snapshotProblemText
                    : undefined;
            const stateLabel = item.transition === "recovered"
              ? "recovered"
              : undefined;
            const detail = detailLabel
              ? `${formatSeparator(theme)}${formatMetadata(theme, detailLabel)}`
              : "";
            const durationText = duration
              ? ` ${formatMetadata(theme, duration)}`
              : "";
            const row =
              `${formatIdentity(theme, item.name)}${formatSeparator(theme)}` +
              `${formatState(theme, state, { label: stateLabel })}` +
              `${formatSeparator(theme)}${formatMetadata(theme, item.elapsedText)}` +
              `${detail}${durationText}`;
            contentLines.push(truncateToWidth(row, lineWidth, ""));
          }
        } else {
          for (const line of lines) {
            contentLines.push(
              span(
                theme,
                "dim",
                truncateToWidth(sanitizeDisplayLine(line), lineWidth, ""),
              ),
            );
          }
        }

        if (overflow > 0) {
          contentLines.push(
            truncateToWidth(
              formatMetadata(theme, `+${overflow} more running.`),
              lineWidth,
              "",
            ),
          );
        }
        if (!options.expanded) {
          contentLines.push(
            truncateToWidth(
              formatKeyHint(theme, keyText("app.tools.expand"), "to expand"),
              lineWidth,
              "",
            ),
          );
        }

        const box = new Box(
          outputPad,
          1,
          (text: string) => theme.bg("customMessageBg", text),
        );
        box.addChild(new Text(contentLines.join("\n"), 0, 0));
        return ["", ...box.render(width)];
      },
    };
  });

  pi.registerMessageRenderer("subagent_ping", (message, options, theme) => {
    const details = message.details as
      | { name?: string; agent?: string; message?: string; sessionFile?: string }
      | undefined;
    if (!details) return undefined;

    return {
      invalidate() {},
      render(width: number): string[] {
        const name = details.name ?? "subagent";
        const header =
          `${formatState(theme, "help", { glyphOnly: true })} ` +
          `${formatIdentity(theme, name, details.agent)}` +
          `${formatSeparator(theme, "—")}` +
          `${formatStateLabel(theme, "help")}`;
        const outputPad = Number.isFinite(options.outputPad)
          ? Math.max(0, Math.floor(options.outputPad))
          : 1;
        const lineWidth = Math.max(0, width - outputPad * 2);
        const contentLines = [truncateToWidth(header, lineWidth, "")];
        const messageLines = sanitizeDisplayText(details.message ?? "").split("\n");

        if (options.expanded) {
          contentLines.push("");
          for (const line of messageLines) {
            contentLines.push(truncateToWidth(line, lineWidth, ""));
          }
          if (details.sessionFile) {
            contentLines.push("");
            contentLines.push(
              truncateToWidth(
                formatMetadata(
                  theme,
                  `Session: ${sanitizeDisplayLine(details.sessionFile)}`,
                ),
                lineWidth,
                "",
              ),
            );
          }
        } else {
          const preview = messageLines[0] ?? "";
          contentLines.push(
            truncateToWidth(span(theme, "dim", preview), lineWidth, ""),
          );
          contentLines.push(
            truncateToWidth(
              formatKeyHint(theme, keyText("app.tools.expand"), "to expand"),
              lineWidth,
              "",
            ),
          );
        }

        const box = new Box(
          outputPad,
          1,
          (text: string) => theme.bg("customMessageBg", text),
        );
        box.addChild(new Text(contentLines.join("\n"), 0, 0));
        return ["", ...box.render(width)];
      },
    };
  });
}
