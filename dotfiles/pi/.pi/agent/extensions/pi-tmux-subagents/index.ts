import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { keyText } from "@earendil-works/pi-coding-agent";
import { Box, Text, truncateToWidth } from "@earendil-works/pi-tui";
import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type, type Static } from "typebox";
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
import {
	describeWorkflowWriteBoundaryReport,
	evaluateWorkflowWriteBoundarySnapshot,
	type WorkflowWriteBoundarySnapshot,
} from "./workflow/write-policy.ts";
import { classifyProviderFailure } from "./workflow/recovery.ts";
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
  resolveResultPresentation,
  resolveResumeLaunchBehavior,
} from "./subagent-services.ts";
import {
	createWorkflowRunState,
	persistWorkflowRunSnapshots,
	restoreWorkflowRunStateFromSession,
	type WorkflowRunState,
	type WorkflowRunTransitionResult,
} from "./workflow/state.ts";
import { registerWorkflowLifecycleTools } from "./workflow/tools.ts";
import { registerWorkflowCommands } from "./workflow/runtime.ts";

/**
 * pi-tmux-subagents: a tmux-only port of pi-interactive-subagents
 * (https://github.com/hazat/pi-interactive-subagents).
 *
 * Scope: tmux is the only terminal multiplexer backend. cmux, zellij, and
 * WezTerm branches from upstream are not ported. Child pi sessions run the
 * plain `pi` binary from PATH in a new tmux pane; when the parent runs under a
 * nono sandbox profile, children are not sandboxed.
 *
 * Tools: `subagent`, `subagent_interrupt`, `subagents_list`, `subagent_resume`.
 * Commands: `/iterate`, `/subagent`, `/workflow`, `/workflows`,
 * `/workflow-resume`, plus collision-free aliases from discovered manifests.
 * Agents are discovered from `<this dir>/agents`, `~/.pi/agent/agents`
 * (`PI_CODING_AGENT_DIR`), and `./.pi/agents`; later sources win.
 * See NOTES.md for the pi 0.84.3 prompt-argument findings behind
 * `buildPiPromptArgs`.
 */

/** Absolute path to this extension directory. */
const SUBAGENTS_DIR = dirname(fileURLToPath(import.meta.url));

// Survive /reload: clear timers and abort poll loops from the previous module load.
// /reload re-imports this file, giving fresh module-level state, but closures from
// the old module keep running.
const WIDGET_INTERVAL_KEY = Symbol.for("pi-tmux-subagents/widget-interval");
const STATUS_INTERVAL_KEY = Symbol.for("pi-tmux-subagents/status-interval");
const POLL_ABORT_KEY = Symbol.for("pi-tmux-subagents/poll-abort-controller");

type GlobalState = Record<symbol, unknown>;
// SAFETY: module state is stored on globalThis only under private symbols above.
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
        "Model policy: 'parent' uses the parent session model and thinking, 'pick' opens the shared model and thinking picker, 'previous' is invalid for new spawns, or an explicit 'provider/model[:thinking]' value such as 'anthropic/claude-opus-4-5:high'. Omit to use the agent's configured default from ~/.pi/agent/agent-models.json (managed by /agent-models), else the agent frontmatter model, else the parent session model.",
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

/** Tools that are gated by `spawning: false` */
const SPAWNING_TOOLS = new Set([
  "subagent",
  "subagent_interrupt",
  "subagents_list",
  "subagent_resume",
  "workflow_spawn",
  "workflow_resume",
  "workflow_recover",
  "workflow_complete",
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

/** Resolve the global agent config directory, respecting PI_CODING_AGENT_DIR. */
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
  const configuredModel = params.model ?? agentDefs?.model;
  const parentModel = parentSelection.model
    ? `${parentSelection.model.provider}/${parentSelection.model.id}`
    : undefined;
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
 * typical for `/iterate` with `fork: true`), the subagent is interactive.
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
    // The spawn identifier (file basename) keys every read and write below.
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
        // Revalidate against the registry before the value reaches disk.
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
 * (direnv, devenv). Default 500ms.
 */
function getShellReadyDelayMs(): number {
  const raw = process.env.PI_SUBAGENT_SHELL_READY_DELAY_MS?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 500;
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
 * T9: resolve the registered context window for the model that produced the
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
 * T9: enrich the child-session usage summary with the registered context
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

/** Result from running a single subagent. */
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
   * T9: provider-neutral usage summary aggregated from the child session's
   * completed assistant entries. Present only when at least one completed
   * request exists; cache fields appear only when the provider reports them.
   */
  usage?: SubagentUsageSummary;
  /** True when this run produced a new assistant response, not only exit 0. */
  responded?: boolean;
  ping?: { name: string; message: string };
}

/** State for a launched (but not yet completed) subagent. */
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
  /**
   * Generic manifest write-policy boundary. Shared subagent services keep
   * this opaque; the index composition layer evaluates it after completion.
   */
  boundary?: unknown;
}

/** All currently running subagents, keyed by id. */
const runningSubagents = new Map<string, RunningSubagent>();

// ── pi-tasks RPC bridge (protocol-v2 provider) ──

/** Live task-RPC registration, once per root session (null after shutdown). */
let attachedTaskRpc: AttachedTaskRpc | null = null;
/** In-flight attach, so double-bound session_starts never register twice. */
let taskRpcAttachInFlight: Promise<void> | null = null;
/** Session generation; bumped on every shutdown to invalidate in-flight attaches. */
let taskRpcAttachEpoch = 0;

/** Effective agent-profile search dirs for the task bridge (project > global > bundled). */
function getTaskAgentProfileDirs(): TaskAgentProfileDirs {
	return {
		project: join(process.cwd(), ".pi", "agents"),
		global: join(getAgentConfigDir(), "agents"),
		bundled: getBundledAgentsDir(),
	};
}

/** Latest partial assistant text from a task child's session file. */
function readTaskPartialResult(handle: TaskRunHandle): string | undefined {
	try {
		if (!existsSync(handle.sessionFile)) return undefined;
		return findLastAssistantMessage(getNewEntries(handle.sessionFile, 0)) ?? undefined;
	} catch {
		return undefined;
	}
}

/** Runtime hooks binding the protocol bridge to this extension's tmux primitives. */
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

/** Validate and resolve a pi-tasks spawn request, then create its pane. */
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

/** Unsubscribe handlers, terminate adapter-owned panes, drop task records. */
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

/** Test access to the bridge state (reset between test cases). */
function getAttachedTaskRpcForTests(): AttachedTaskRpc | null {
	return attachedTaskRpc;
}

function resetTaskRpcForTests(): void {
	shutdownPiTasksRpcBridge();
}

/** Persisted generic workflow lifecycle state for dedicated workflow tools. */
let workflowRunState: WorkflowRunState = createWorkflowRunState();

function commitWorkflowRunTransition(
  pi: ExtensionAPI,
  transition: WorkflowRunTransitionResult,
): void {
  let appended = 0;
  try {
    for (const snapshot of transition.snapshots) {
      persistWorkflowRunSnapshots(pi, [snapshot]);
      appended += 1;
    }
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    if (appended > 0) {
      // A multi-snapshot transition (currently active-run replacement) can
      // fail after its durable prefix was appended. The final transition
      // state is not durable, while the previous live state is now stale.
      // Fail closed until session reload reconstructs the appended prefix.
      workflowRunState = createWorkflowRunState();
      throw new Error(
        `Workflow state persistence failed after appending ${appended} of ${transition.snapshots.length} snapshots; `
        + `live workflow state was cleared to avoid publishing an undurable or stale active run. ${cause}`,
      );
    }
    throw new Error(
      `Workflow state persistence failed before any snapshot was appended; live workflow state was left unchanged. ${cause}`,
    );
  }
  workflowRunState = transition.state;
}

function getWorkflowRunStateForTests(): WorkflowRunState {
  return workflowRunState;
}

function setWorkflowRunStateForTests(state: WorkflowRunState): void {
  workflowRunState = state;
}

// ── Widget management ──

/** Latest ExtensionContext from session_start, used for widget updates. */
let latestCtx: ExtensionContext | null = null;

/** Interval timer for widget re-renders. */
let widgetInterval: ReturnType<typeof setInterval> | null = null;

/** Interval timer for status transition checks. */
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
          // Render the bordered box two columns narrower, then add the outer
          // margin so the panel aligns with the framed editor above/below it.
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
 * pi 0.84.3 prepends every `@file` argument to the first positional message and
 * expands `/skill:<name> <args>` only when that first message starts with
 * `/skill:`. Later positional messages become separate prompts after the first
 * turn. So when skills are requested, the launcher passes exactly one argument,
 * `/skill:<first skill> <task text>`, and never combines it with `@file`.
 * Only the first skill can be expanded by the CLI; additional skills are named
 * in the task text. Without skills the task argument is passed through
 * (`@<artifact>` for artifact delivery, the task text for direct delivery).
 * See NOTES.md for the spike that established this.
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
      content: [{ type: "text" as const, text: resolved.error }],
      details: { error: resolved.error },
    };
  }

  const running = resolved.running;
  if (running.cli === "claude") {
    return {
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

      // Interactive subagents do not wake the parent on stalled/recovered
      // transitions; the user is working in that pane. The widget still updates.
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
  describeBoundary: describeRunningBoundary,
  onRolloverLaunched: ({ running, recovery }) => {
    if (recovery) {
      try {
        updateLaunchProfile(running.sessionFile, (next) => ({
          ...next,
          runtime: { ...next.runtime, previousFailure: recovery.failure },
        }));
      } catch {
        // Best-effort; the launch already succeeded.
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

/** Result details shared by the resume and recovery launch paths. */
interface SubagentToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

/** Repository-boundary outcome attached to a finished workflow child's result. */
interface PhaseBoundaryOutcome {
  details: Record<string, unknown>;
  /** Stop instruction shown to the orchestrator; present only on violation. */
  violationText?: string;
}

/**
 * Evaluate a finished child's manifest write boundary. Read-only: the
 * repository keeps every change exactly as the child left it. Ordinary
 * subagents carry no boundary and return undefined.
 */
function isWorkflowWriteBoundarySnapshot(
  value: unknown,
): value is WorkflowWriteBoundarySnapshot {
  return typeof value === "object"
    && value !== null
    && "workflowId" in value
    && "roleId" in value
    && "resolvedWrites" in value
    && "protectedFiles" in value;
}

function describeRunningBoundary(
  running: Pick<RunningSubagent, "boundary">,
): PhaseBoundaryOutcome | undefined {
  const genericBoundary = running.boundary;
  if (isWorkflowWriteBoundarySnapshot(genericBoundary)) {
    const report = evaluateWorkflowWriteBoundarySnapshot(genericBoundary);
    return report ? describeWorkflowWriteBoundaryReport(report) : undefined;
  }
  return undefined;
}

/** Parameters accepted by the shared resume implementation. */
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
 * Internal only — never exposed through the public `subagent` tool schema.
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
    /** pi-tasks RPC launch: forces autonomous behavior (internal). */
    taskRuntime?: TaskRuntimeOptions;
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
  describeRunningBoundary,
  getWorkflowRunStateForTests,
  setWorkflowRunStateForTests,
  commitWorkflowRunTransition,
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
};

const ASYNC_TOOL_CONTRACT =
  "This is a fire-and-forget async tool: the call returns immediately with only an acknowledgement. " +
  "When the sub-agent finishes, the harness AUTOMATICALLY delivers its result as a steer message that wakes you up and starts a new turn — you do not need to do anything to receive it. " +
  "DO NOT write polling loops, sleep/wait commands, tail/watch scripts, or repeatedly read session/log files to detect completion. DO NOT call subagents_list or any other tool to 'check' status. All of that is wasted work — the harness handles delivery for you. " +
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

export default function piTmuxSubagents(pi: ExtensionAPI): void {
  workflowRunState = createWorkflowRunState();
  const workflowCommands = registerWorkflowCommands(
    pi,
    {
      state: {
        getState: () => workflowRunState,
        commit: (transition) => commitWorkflowRunTransition(pi, transition),
      },
      loadAgent: loadAgentDefaults,
      isTmuxAvailable,
      muxSetupHint,
      renameTab: renameCurrentTab,
    },
  );

  pi.on("session_start", (_event, ctx) => {
    latestCtx = ctx;
    // /new, /resume, and /fork tore the previous session down through
    // session_shutdown without re-importing this module. Re-arm the poll-abort
    // controller so subagent spawns in this session can watch their panes.
    rearmModuleAbortController();
    const restored = restoreWorkflowRunStateFromSession(ctx.sessionManager);
    // Restore the in-memory state first so a transient parent-session append
    // failure cannot leave the restored run unreachable for this session.
    workflowRunState = restored.state;
    try {
      persistWorkflowRunSnapshots(pi, restored.snapshots);
    } catch (error) {
      const cause = error instanceof Error ? error.message : String(error);
      try {
        ctx.ui.notify(
          `Workflow run restored in memory, but persisting the interrupted transition to the session log failed: `
          + `${cause}. The status is re-derived on the next reload.`,
          "warning",
        );
      } catch {
        // Workflow snapshot persistence must not block unrelated session startup services.
      }
    }
    try {
      workflowCommands.refreshRegistry(ctx);
    } catch (error) {
      try {
        ctx.ui.notify(
          `Workflow discovery failed: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        );
      } catch {
        // Workflow discovery must not block unrelated session startup services.
      }
    }
    workflowCommands.restoreActiveRunUx(ctx);
    // pi-tasks protocol bridge: root sessions register the task RPC handlers
    // (children abstain via PI_SUBAGENT_* env; foreign providers win).
    void attachPiTasksRpcBridge(pi, ctx).catch(() => {
      // Provider probing or registration failed; the bridge stays absent and
      // pi-tasks reports task execution as unavailable.
    });
  });

  pi.on("session_shutdown", () => {
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
    workflowRunState = createWorkflowRunState();
  });

  // Tools denied via PI_DENY_TOOLS (set by the parent from agent frontmatter).
  const deniedTools = new Set(
    (process.env.PI_DENY_TOOLS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const shouldRegister = (name: string) => !deniedTools.has(name);

  // ── subagent tool ──
  if (shouldRegister("subagent"))
    pi.registerTool({
      name: "subagent",
      label: "Subagent",
      description: SUBAGENT_TOOL_DESCRIPTION,
      promptSnippet: SUBAGENT_TOOL_DESCRIPTION,
      parameters: SubagentParams,

      async execute(_toolCallId, rawParams, _signal, _onUpdate, ctx) {
        const params = normalizeSubagentParams(rawParams);
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
        // Agent frontmatter for this spawn, loaded once for both the explicit
        // model branch and the per-agent configured-default branch below.
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

        const running = await launchSubagent(
          params,
          { ...ctx, pi },
          {
            ...(resolvedModel ? { resolvedModel } : {}),
          },
        );

        subagentExecution.watchInBackground({
          pi,
          ctx,
          running,
          pingAgent: running.agent,
          pingSessionPath: running.cli === "claude" ? undefined : running.sessionFile,
          onSuccess: ({ result, boundary }) => {
            const usage = resolveUsageDetails(result, ctx);
            const base = resolveResultPresentation(
              { ...result, ...(usage ? { usage } : {}) },
              running.name,
            );
            const presentation = boundary?.violationText
              ? `${boundary.violationText}\n\n${base}`
              : base;

            return {
              content: presentation,
              details: {
                name: running.name,
                task: running.task,
                agent: running.agent,
                exitCode: result.exitCode,
                elapsed: result.elapsed,
                sessionFile: result.sessionFile,
                ...(result.errorMessage
                  ? {
                    errorMessage: result.errorMessage,
                    failureKind: classifyProviderFailure(result.errorMessage),
                  }
                  : {}),
                ...(usage ? { usage } : {}),
                ...(result.claudeSessionId ? { claudeSessionId: result.claudeSessionId } : {}),
                ...(boundary ? boundary.details : {}),
              },
            };
          },
          onError: (message) => ({
            content: `Sub-agent "${running.name}" error: ${message}`,
            details: { name: running.name, task: running.task, error: message },
          }),
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

        // One-line task preview. renderCall runs repeatedly while the LLM
        // streams arguments, so keep it compact.
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

  // ── subagent_interrupt tool ──
  if (shouldRegister("subagent_interrupt"))
    pi.registerTool({
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
    });

  // ── subagents_list tool ──
  if (shouldRegister("subagents_list"))
    pi.registerTool({
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
    });

  // ── subagent_resume tool ──
  if (shouldRegister("subagent_resume"))
    pi.registerTool({
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
    });

  registerWorkflowLifecycleTools(
    pi,
    {
      state: {
        getState: () => workflowRunState,
        commit: (transition) => commitWorkflowRunTransition(pi, transition),
      },
      execution: subagentExecution,
      loadAgentDefaults,
      isTmuxAvailable,
      muxUnavailableResult,
    },
    { shouldRegister },
  );

  // /iterate: fork the session into a subagent
  pi.registerCommand("iterate", {
    description: "Fork session into a subagent for focused work (bugfixes, iteration)",
    handler: async (args) => {
      const task = args.trim() || "";
      const taskText = task || "The user wants to do some hands-on work. Help them with whatever they need.";
      const toolCall =
        `Use subagent to fork a session. fork: true, name: "Iterate", task: ${JSON.stringify(taskText)}. ` +
        "Do not set agent, tools, skills, or model.";
      pi.sendUserMessage(toolCall);
    },
  });

  // /subagent: spawn a subagent by name
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
      const toolCall = `Use subagent with agent: "${agentName}", name: "${displayName}", task: ${JSON.stringify(taskText)}`;
      pi.sendUserMessage(toolCall);
    },
  });

  // /agent-models: manage per-agent default models interactively
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

  // ── subagent_result message renderer ──
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
        // T9: the compact usage/context-pressure line is rendered from
        // details.usage under the header, so the copy appended to the
        // model-visible content is stripped here to avoid duplication.
        const usageLine = formatUsageSummary(details.usage);
        const rawContent = typeof message.content === "string" ? message.content : "";

        // Clean summary (remove usage line, session ref, and leading label for display)
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

  // ── subagent_status message renderer ──
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

  // ── subagent_ping message renderer ──
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
