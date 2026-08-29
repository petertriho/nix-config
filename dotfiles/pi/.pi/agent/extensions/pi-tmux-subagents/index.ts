import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { keyText } from "@earendil-works/pi-coding-agent";
import { Box, Text, truncateToWidth } from "@earendil-works/pi-tui";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type, type Static } from "typebox";
import {
  type ActivityReadResult,
  type SubagentActivityState,
  getSubagentActivityFile,
  readSubagentActivityFile,
} from "./activity.ts";
import {
  buildRolloverHandoff,
  calculateContextFit,
  chooseResumeGateAction,
  estimateSavedSessionContext,
  type ContextFit,
  type ResumeGateAction,
  type SavedContextEstimate,
  linkRolloverLineage,
  toContextEstimateRecord,
} from "./context-fit.ts";
import {
  type LaunchProfile,
  type LaunchProfileResources,
  type LaunchProfileWorkflowMetadata,
  type ModelSelection,
  type PrimarySkillIdentity,
  type ProviderFailureRecord,
  type WorkflowArtifacts,
  type WorkflowPhase,
  THINKING_LEVELS,
  fingerprintStrings,
  hashText,
  readLaunchProfile,
  removeLaunchProfile,
  updateLaunchProfile,
  updateProfileAfterSuccessfulResponse,
  writeLaunchProfile,
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
	capturePhaseBoundarySnapshot,
	evaluatePhaseBoundarySnapshot,
	formatPhaseBoundaryViolation,
	type PhaseBoundarySnapshot,
} from "./repo-postconditions.ts";
import {
  diffResourceFingerprints,
  primarySkillChanged,
  resolveResumeRestoration,
  resourceChangeNotice,
} from "./resume-restore.ts";
import {
	type WorkflowRuntimeState,
	applyWorkflowRecoveryOverride,
	buildWorkflowMetadata,
	chooseWorkflowStartup,
	resolveWorkflowPhaseSelection,
	updateWorkflowActiveSession,
	workflowPhaseForAgent,
} from "./workflow-startup.ts";
import {
	type ProviderFailureKind,
	RECOVERY_SELECT_MODEL,
	RECOVERY_STOP,
	WORKFLOW_PHASE_LABELS,
	buildProviderFailureRecord,
	classifyProviderFailure,
	defaultRecoveryMessage,
	formatFailureKind,
	formatRecoverySummary,
	shouldOpenRecoveryGate,
} from "./workflow-recovery.ts";
import { findLastAssistantMessage, getNewEntries, seedSubagentSessionFile } from "./session.ts";
import {
  type SubagentUsageSummary,
  formatUsageSummary,
  summarizeSubagentUsage,
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
  createStatusState,
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
  shellEscape,
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
 * Commands: `/iterate`, `/subagent`, `/workflow` (prompt in `workflow-skill.md`).
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
  workflowRunId: Type.Optional(
    Type.String({
      description:
        "Internal /workflow run token from the <workflow-config> block. Omit for ordinary subagent spawns.",
    }),
  ),
  workflowArtifacts: Type.Optional(
    Type.Object({
      plan: Type.Optional(Type.String({ description: "Absolute PLAN.md path for this workflow phase" })),
      tasks: Type.Optional(Type.String({ description: "Absolute TASKS.md path for this workflow phase" })),
      review: Type.Optional(Type.String({ description: "Absolute REVIEW.md path for this workflow phase" })),
      baseRef: Type.Optional(Type.String({ description: "Git base ref for implementation and review" })),
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
  "workflowRunId",
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
  if (normalized.workflowArtifacts) {
    const artifacts = normalizeWorkflowArtifacts(normalized.workflowArtifacts);
    if (Object.keys(artifacts).length > 0) normalized.workflowArtifacts = artifacts;
    else delete normalized.workflowArtifacts;
  }
  return normalized;
}

function normalizeWorkflowArtifacts(
  artifacts: Partial<Record<keyof WorkflowArtifacts, string>>,
): WorkflowArtifacts {
  const normalized: WorkflowArtifacts = {};
  for (const key of ["plan", "tasks", "review", "baseRef"] as const) {
    const value = artifacts[key];
    if (typeof value === "string" && value.trim()) normalized[key] = value.trim();
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
  "subagent_recover",
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

function getDefaultSessionDirFor(cwd: string, agentDir: string): string {
  const safePath = `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  const sessionDir = join(agentDir, "sessions", safePath);
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }
  return sessionDir;
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
  const display = def.name !== id ? ` (${def.name})` : "";
  const configured = agents[id];
  const base = `${id}${display} — ${configured ?? "parent default"}`;
  if (def.cli) return `${base} · frontmatter only`;
  if (workflowPhaseForAgent(id)) return `${base} · ad-hoc spawns only`;
  return base;
}

/**
 * Interactive manager behind `/agent-models`: list every discovered agent
 * with its configured default (or "parent default"), then set or clear one
 * entry at a time. Every change is validated against the registry and saved
 * immediately through the atomic write, so the on-disk config is always the
 * source of truth. Workflow phase roles are annotated "ad-hoc spawns only"
 * because `/workflow` resolves them through its own model-policy gate;
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
        picked = await pickModelSelection(ctx, { title: `Default model for ${id}` });
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

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
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

/**
 * Internal artifact directory for the current session:
 *   <sessionDir>/artifacts/<session-id>/
 * Holds task files, system prompts, launch scripts, and activity snapshots.
 */
function getArtifactDir(sessionDir: string, sessionId: string): string {
  return join(sessionDir, "artifacts", sessionId);
}

function toSafeFileName(name: string, fallback: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || fallback
  );
}

function fileTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
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

function resolveResultPresentation(
  result: Pick<
    SubagentResult,
    "exitCode" | "elapsed" | "summary" | "sessionFile" | "errorMessage" | "usage"
  >,
  name: string,
): string {
  const sessionRef = result.sessionFile
    ? `\n\nSession: ${result.sessionFile}\nResume: pi --session ${result.sessionFile}`
    : "";
  // T9: compact usage/context-pressure line. Appended after the summary —
  // the model-visible final message itself stays intact and untruncated.
  const usageBlock = formatUsageSummary(result.usage);
  const usageRef = usageBlock ? `\n\n${usageBlock}` : "";

  if (result.errorMessage) {
    return (
      `Sub-agent "${name}" failed after ${formatElapsed(result.elapsed)} ` +
      `(provider/agent error — auto-retry exhausted).\n\n` +
      `Error: ${result.errorMessage}\n\n` +
      `The subagent did not produce a result. You can retry by spawning a new ` +
      `subagent or resume the session with subagent_resume.${usageRef}${sessionRef}`
    );
  }

  return result.exitCode === 0
    ? `Sub-agent "${name}" completed (${formatElapsed(result.elapsed)}).\n\n${result.summary}${usageRef}${sessionRef}`
    : `Sub-agent "${name}" failed (exit code ${result.exitCode}).\n\n${result.summary}${usageRef}${sessionRef}`;
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
   * T7 phase-boundary baseline captured before a planner, task-writer, or
   * reviewer child started working. Undefined for the implementer and for
   * spawns outside a /workflow phase: implementer scope is governed by
   * TASKS.md, never by an artifact-only path rule.
   */
  phaseBoundary?: PhaseBoundarySnapshot;
}

/** All currently running subagents, keyed by id. */
const runningSubagents = new Map<string, RunningSubagent>();

/** Active `/workflow` model policy, set only by the `/workflow` startup gate. */
let activeWorkflowRuntime: WorkflowRuntimeState | null = null;
/** Token that scopes phase spawns to the currently active workflow run. */
let activeWorkflowRunId: string | null = null;

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

const SUBAGENT_CONTROL_TOOLS = ["caller_ping", "subagent_done"] as const;

/**
 * Build the child --tools allowlist.
 *
 * pi applies --tools to built-in, extension, and custom tools. If a subagent
 * definition restricts tools to e.g. "read,bash,write", the child control
 * tools from subagent-done.ts would otherwise be hidden, leaving a manually
 * resumed or user-touched subagent unable to call subagent_done.
 */
function buildSubagentToolAllowlist(effectiveTools?: string): string | null {
  const requested = (effectiveTools ?? "")
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);

  if (requested.length === 0) return null;

  const allow = new Set(requested);
  for (const tool of SUBAGENT_CONTROL_TOOLS) {
    allow.add(tool);
  }

  return [...allow].join(",");
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

function resolveResumeLaunchBehavior(params: { autoExit?: boolean }): { autoExit: boolean; interactive: boolean } {
  const autoExit = params.autoExit ?? true;
  return { autoExit, interactive: !autoExit };
}

function buildResumePiArgs(sessionPath: string, modelArgument?: string): string[] {
  return [
    "pi",
    "--session",
    shellEscape(sessionPath),
    ...(modelArgument ? ["--model", shellEscape(modelArgument)] : []),
  ];
}

function startWidgetRefresh() {
  if (widgetInterval) return;
  updateWidget();
  widgetInterval = setInterval(() => {
    updateWidget();
  }, 1000);
  globalState[WIDGET_INTERVAL_KEY] = widgetInterval;
}

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

function findPrimarySkillPath(
  skillName: string,
  cwd?: string,
  agentDir?: string,
): string | undefined {
  const candidates = [
    ...(cwd
      ? [
        join(cwd, ".pi", "skills", skillName, "SKILL.md"),
        join(cwd, ".agents", "skills", skillName, "SKILL.md"),
      ]
      : []),
    join(process.cwd(), ".pi", "skills", skillName, "SKILL.md"),
    join(process.cwd(), ".agents", "skills", skillName, "SKILL.md"),
    ...(agentDir ? [join(agentDir, "skills", skillName, "SKILL.md")] : []),
    join(getAgentConfigDir(), "skills", skillName, "SKILL.md"),
    join(homedir(), ".agents", "skills", skillName, "SKILL.md"),
  ];
  return candidates.find((path) => existsSync(path));
}

function resolvePrimarySkill(
  effectiveSkills: string | undefined,
  cwd?: string,
  agentDir?: string,
): PrimarySkillIdentity | undefined {
  const primary = parseSkillList(effectiveSkills)[0];
  if (!primary) return undefined;
  const path = findPrimarySkillPath(primary, cwd, agentDir);
  if (!path) return undefined;
  try {
    return { name: primary, path, hash: hashText(readFileSync(path, "utf8")) };
  } catch {
    return undefined;
  }
}

function collectResourceFingerprints(
  pi: ExtensionAPI | undefined,
  effectiveSkills: string | undefined,
): LaunchProfileResources {
  const tools = pi?.getActiveTools?.() ?? [];
  const namedSkills = parseSkillList(effectiveSkills);
  const commandSkills =
    pi?.getCommands?.().filter((command) => command.source === "skill").map((command) => command.name) ?? [];
  const visibleSkills = [...new Set([...namedSkills, ...commandSkills])];
  return {
    tools: fingerprintStrings(tools),
    visibleSkills: fingerprintStrings(visibleSkills),
    updatedAt: new Date().toISOString(),
  };
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
  const model = parseLegacyModelSelection(input.modelArgument);
  const primarySkill = resolvePrimarySkill(input.effectiveSkills, input.cwd, input.agentDir);
  const createdAt = new Date().toISOString();
  return {
    version: 1,
    stable: {
      ...(input.agentName ? { agentName: input.agentName } : {}),
      displayName: input.displayName,
      roleBody: input.roleBody,
      roleBodyHash: hashText(input.roleBody),
      systemPromptMode: input.systemPromptMode,
      cwd: input.cwd,
      agentDir: input.agentDir,
      controls: input.controls,
      ...(primarySkill ? { primarySkill } : {}),
      originalSessionPath: input.originalSessionPath,
      createdAt,
    },
    runtime: {
      ...(model ? { originalModel: model, lastModel: model } : {}),
      resumeCount: 0,
    },
    resources: input.resources,
    ...(input.workflow ? { workflow: input.workflow } : {}),
  };
}

/** Result details shared by the resume and recovery launch paths. */
interface SubagentToolResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

function workflowArtifactForPhase(
  workflow: LaunchProfileWorkflowMetadata,
): string | undefined {
  if (workflow.phase === "planner") return workflow.artifacts.plan;
  if (workflow.phase === "task-writer") return workflow.artifacts.tasks;
  if (workflow.phase === "reviewer") return workflow.artifacts.review;
  return undefined;
}

/** Phase-boundary outcome attached to a finished workflow child's result. */
interface PhaseBoundaryOutcome {
  details: Record<string, unknown>;
  /** Stop instruction shown to the orchestrator; present only on violation. */
  violationText?: string;
}

/**
 * Evaluate a finished child's phase boundary against its pre-phase snapshot.
 * Read-only: the repository keeps every change exactly as the child left it.
 * Returns undefined when the child carried no snapshot (implementer, spawns
 * outside a /workflow phase, or a non-repo project) or when the after state
 * cannot be read; both cases report no violation.
 */
function describeRunningPhaseBoundary(
  running: Pick<RunningSubagent, "phaseBoundary">,
): PhaseBoundaryOutcome | undefined {
  const snapshot = running.phaseBoundary;
  if (!snapshot) return undefined;
  const report = evaluatePhaseBoundarySnapshot(snapshot);
  if (!report) return undefined;
  const details = {
    phaseBoundary: {
      phase: snapshot.phase,
      artifact: snapshot.artifact,
      violated: report.violated,
      allowedPaths: report.allowedPaths,
      unexpectedPaths: report.unexpectedPaths,
    },
  };
  if (!report.violated) return { details };
  const phaseLabel =
    WORKFLOW_PHASE_LABELS[snapshot.phase as WorkflowPhase] ?? snapshot.phase;
  return {
    details,
    violationText: formatPhaseBoundaryViolation({
      phaseLabel,
      artifact: snapshot.artifact,
      report,
    }),
  };
}

function sendSubagentPing(
  pi: ExtensionAPI,
  result: SubagentResult,
  agent: string | undefined,
  sessionPath: string | undefined,
  boundary?: PhaseBoundaryOutcome,
) {
  if (!result.ping) return;
  const sessionRef = sessionPath ? `\n\nSession: ${sessionPath}\nResume: pi --session ${sessionPath}` : "";
  const violation = boundary?.violationText ? `\n\n${boundary.violationText}` : "";
  pi.sendMessage(
    {
      customType: "subagent_ping",
      content: `Sub-agent "${result.ping.name}" needs help (${formatElapsed(result.elapsed)}):\n\n${result.ping.message}${violation}${sessionRef}`,
      display: true,
      details: {
        name: result.ping.name,
        message: result.ping.message,
        agent,
        sessionFile: sessionPath,
        ...(boundary ? boundary.details : {}),
      },
    },
    { triggerTurn: true, deliverAs: "steer" },
  );
}

/** Parameters accepted by the shared resume implementation. */
interface SubagentResumeParams {
  sessionPath: string;
  name?: string;
  message?: string;
  autoExit?: boolean;
  model?: string;
  workflowArtifacts?: WorkflowArtifacts;
}

/** Workflow provider-failure context threaded through a recovery resume. */
interface RecoveryLaunchContext {
  failure: ProviderFailureRecord;
  phase: WorkflowPhase;
  projectRoot?: string;
}

/**
 * Shared resume implementation behind the `subagent_resume` and
 * `subagent_recover` tools.
 *
 * Restores the role contract from the launch-profile sidecar (legacy fallback
 * with a warning), applies the selected model policy with the context-fit
 * gate, and either resumes the saved session or launches a fresh same-role
 * rollover.
 *
 * With `recovery`, workflow provider-failure bookkeeping applies on top: the
 * failure is recorded on the saved profile for diagnostics, a rollover
 * replacement becomes the workflow's active session for its phase, and a
 * successful recovery response replaces that role's current workflow default
 * for the remainder of the workflow. The saved project preset is never
 * touched from recovery.
 */
async function executeSubagentResume(
  pi: ExtensionAPI,
  params: SubagentResumeParams,
  ctx: LaunchContext & Parameters<typeof resolveModelPolicy>[1],
  recovery?: RecoveryLaunchContext,
): Promise<SubagentToolResult> {
  const name = params.name ?? "Resume";
  const startTime = Date.now();
  const id = Math.random().toString(16).slice(2, 10);

  if (!existsSync(params.sessionPath)) {
    return {
      content: [
        { type: "text", text: `Error: session file not found: ${params.sessionPath}` },
      ],
      details: { error: "session not found" },
    };
  }

  let profileRead = readLaunchProfile(params.sessionPath);
  if (profileRead.status === "invalid") {
    return {
      content: [{ type: "text", text: `Error: ${profileRead.error}` }],
      details: { error: "invalid launch profile" },
    };
  }
  if (
    profileRead.status === "ok"
    && profileRead.profile.workflow
    && params.workflowArtifacts
  ) {
    const artifacts = {
      ...profileRead.profile.workflow.artifacts,
      ...normalizeWorkflowArtifacts(params.workflowArtifacts),
    };
    try {
      const profile = updateLaunchProfile(params.sessionPath, (stored) =>
        stored.workflow
          ? { ...stored, workflow: { ...stored.workflow, artifacts } }
          : stored);
      profileRead = { status: "ok", profile };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: could not update workflow handoff: ${message}` }],
        details: { error: "workflow handoff update failed", message },
      };
    }
  }

  const restoration = resolveResumeRestoration(
    profileRead.status === "ok" ? profileRead.profile : null,
    params,
  );
  const { autoExit, interactive } = restoration;
  const resumeWarnings: string[] = [];
  let freshForPrimarySkillChange = false;
  if (restoration.legacyWarning) {
    resumeWarnings.push(restoration.legacyWarning);
    await ctx.ui?.notify?.(restoration.legacyWarning, "warning");
  }

  const currentResources = collectResourceFingerprints(
    pi,
    profileRead.status === "ok" ? profileRead.profile.stable.primarySkill?.name : undefined,
  );
  if (profileRead.status === "ok") {
    const resourceChanges = diffResourceFingerprints(
      profileRead.profile.resources,
      currentResources,
    );
    const notice = resourceChangeNotice(resourceChanges);
    if (notice) {
      resumeWarnings.push(notice);
      await ctx.ui?.notify?.(`Resume uses current resources: ${notice}`, "info");
    }

    const currentPrimarySkill = restoration.agentDir
      ? resolvePrimarySkill(
          profileRead.profile.stable.primarySkill?.name,
          restoration.cwd,
          restoration.agentDir,
        )
      : undefined;
    if (
      profileRead.profile.stable.primarySkill &&
      primarySkillChanged(profileRead.profile, currentPrimarySkill)
    ) {
      const choice = await ctx.ui?.select?.(
        `The ${profileRead.profile.stable.primarySkill.name} skill definition changed since this session was launched.`,
        [
          "Resume with the older instructions",
          "Start a fresh same-role session with the latest skill",
          "Stop this resume",
        ],
      );
      if (choice === "Start a fresh same-role session with the latest skill") {
        freshForPrimarySkillChange = true;
      } else if (choice !== "Resume with the older instructions") {
        return {
          content: [{
            type: "text",
            text: "Resume cancelled because the primary skill definition changed.",
          }],
          details: {
            error: "primary skill changed",
            skill: profileRead.profile.stable.primarySkill.name,
          },
        };
      }
    }
  }

  const profile = profileRead.status === "ok" ? profileRead.profile : null;

  // T7: phase-boundary baseline for resumed artifact phases (planner, task
  // writer, reviewer), captured before any child pane starts working. The
  // implementer is exempt: TASKS.md governs its scope.
  const phaseBoundary = profile?.workflow
    ? capturePhaseBoundarySnapshot(
        profile.workflow.phase,
        profile.workflow.projectRoot ?? profile.stable.cwd,
        workflowArtifactForPhase(profile.workflow),
      )
    : undefined;

  // ── Context fit: estimate the saved session without mutating it ──
  let estimate: SavedContextEstimate | undefined;
  try {
    estimate = estimateSavedSessionContext(params.sessionPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    resumeWarnings.push(`Context estimate unavailable (${message}); rollover gate skipped.`);
  }

  let resolvedModel: ResolvedModelSelection | undefined;
  let fit: ContextFit | undefined;
  let rollover: { profile: LaunchProfile; selection: ResolvedModelSelection } | undefined;
  let modelPolicy = params.model;
  while (true) {
    try {
      const resolution = await resolveModelPolicy(modelPolicy, ctx, {
        mode: "resume",
        ...(profile ? { profile } : {}),
        ...(estimate ? { contextTokens: estimate.tokens } : {}),
      });
      if (resolution.source === "legacy") {
        resolvedModel = undefined;
        fit = undefined;
      } else {
        resolvedModel = resolution;
        const contextWindow = resolution.model.contextWindow;
        fit =
          estimate && Number.isFinite(contextWindow) && contextWindow > 0
            ? calculateContextFit(estimate.tokens, contextWindow)
            : undefined;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        details: { error: "model selection failed", message },
      };
    }

    if (freshForPrimarySkillChange) {
      if (!profile || !resolvedModel) {
        return {
          content: [{
            type: "text",
            text: "Error: a fresh latest-skill rollover needs a launch-profile sidecar and a selected model.",
          }],
          details: { error: "primary skill rollover unavailable" },
        };
      }
      rollover = { profile, selection: resolvedModel };
      break;
    }

    if (!fit?.requiresGate) break;

    // At or above 65% of the selected context window: ask before resuming.
    let action: ResumeGateAction;
    try {
      action = await chooseResumeGateAction(ctx, fit);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        details: { error: "context gate unavailable", message },
      };
    }
    if (action === "choose") {
      modelPolicy = "pick";
      continue;
    }
    if (action === "stop") {
      return {
        content: [{
          type: "text",
          text: "Resume cancelled at the context-fit gate. The saved session was not changed.",
        }],
        details: {
          error: "resume cancelled at context gate",
          contextRatio: fit.ratio,
          ...(resumeWarnings.length > 0 ? { resumeWarnings } : {}),
        },
      };
    }
    if (action === "fresh") {
      if (!profile || !resolvedModel) {
        return {
          content: [{
            type: "text",
            text: "Error: a fresh same-role rollover needs a launch-profile sidecar and a selected model. Choose 'Resume the saved session anyway' or 'Choose another model'.",
          }],
          details: { error: "rollover unavailable without sidecar" },
        };
      }
      rollover = { profile, selection: resolvedModel };
    }
    break;
  }

  if (!isTmuxAvailable()) {
    return muxUnavailableResult();
  }

  const recoveryDetails = (extra: Record<string, unknown> = {}): Record<string, unknown> =>
    recovery
      ? { recovery: { phase: recovery.phase, failureKind: recovery.failure.kind }, ...extra }
      : extra;

  // ── Fresh same-role rollover: a standalone child, not a resume or fork ──
  if (rollover) {
    const rolloverProfile = rollover.profile;
    const running = await launchSubagent(
      {
        name: params.name ?? rolloverProfile.stable.displayName,
        task: buildRolloverHandoff(rolloverProfile, params.message),
        systemPrompt: rolloverProfile.stable.roleBody || undefined,
        cwd: rolloverProfile.stable.cwd,
      },
      { ...ctx, pi },
      {
        resolvedModel: rollover.selection,
        rolloverFrom: rolloverProfile,
        ...(rolloverProfile.workflow
          ? {
            workflow: {
              ...rolloverProfile.workflow,
              currentDefault: rollover.selection.selection,
              ...(recovery ? { assignmentSource: "recovery" as const } : {}),
            },
          }
          : {}),
      },
    );

    // Link old and new sidecars through rollover lineage. Best-effort:
    // the child launch has already succeeded when a linkage write fails.
    const lineageWarnings = linkRolloverLineage(params.sessionPath, running.sessionFile);
    if (lineageWarnings.length > 0) {
      await ctx.ui?.notify?.(`Rollover lineage incomplete: ${lineageWarnings.join("; ")}`, "warning");
    }

    if (recovery) {
      // Diagnostics: the replacement records what it recovered from.
      try {
        updateLaunchProfile(running.sessionFile, (next) => ({
          ...next,
          runtime: { ...next.runtime, previousFailure: recovery.failure },
        }));
      } catch {
        // Best-effort; the launch already succeeded.
      }
    }
    if (rolloverProfile.workflow) {
      // A replacement becomes the workflow's active session for its phase.
      updateActiveWorkflowSession(
        rolloverProfile.workflow.phase,
        running.sessionFile,
        rolloverProfile.workflow.projectRoot,
      );
    }
    if (phaseBoundary) running.phaseBoundary = phaseBoundary;

    const watcherAbort = new AbortController();
    running.abortController = watcherAbort;
    startWidgetRefresh();
    startStatusRefresh(pi);

    watchSubagent(running, watcherAbort.signal)
      .then((result) => {
        updateWidget();

        const boundary = describeRunningPhaseBoundary(running);

        if (result.ping) {
          sendSubagentPing(pi, result, rolloverProfile.stable.agentName, running.sessionFile, boundary);
          return;
        }

        if (
          recovery
          && result.exitCode === 0
          && !result.errorMessage
          && result.responded
        ) {
          applyWorkflowRecoveryOverrideForPhase(
            recovery.phase,
            rollover.selection.selection,
            recovery.projectRoot,
          );
        }

        const usage = resolveUsageDetails(result, ctx);
        const base = resolveResultPresentation(
          { ...result, ...(usage ? { usage } : {}) },
          running.name,
        );
        const presentation = boundary?.violationText
          ? `${boundary.violationText}\n\n${base}`
          : base;
        pi.sendMessage(
          {
            customType: "subagent_result",
            content: presentation,
            display: true,
            details: recoveryDetails({
              name: running.name,
              task: running.task,
              agent: rolloverProfile.stable.agentName,
              exitCode: result.exitCode,
              elapsed: result.elapsed,
              sessionFile: running.sessionFile,
              rollover: "fresh",
              originalSessionPath: params.sessionPath,
              ...(usage ? { usage } : {}),
              ...(result.errorMessage
                ? {
                  errorMessage: result.errorMessage,
                  failureKind: classifyProviderFailure(result.errorMessage),
                }
                : {}),
              ...(boundary ? boundary.details : {}),
            }),
          },
          { triggerTurn: true, deliverAs: "steer" },
        );
      })
      .catch((err) => {
        updateWidget();
        const message = err instanceof Error ? err.message : String(err);
        pi.sendMessage(
          {
            customType: "subagent_result",
            content: `Rollover "${running.name}" error: ${message}`,
            display: true,
            details: recoveryDetails({
              name: running.name,
              error: message,
              rollover: "fresh",
              originalSessionPath: params.sessionPath,
            }),
          },
          { triggerTurn: true, deliverAs: "steer" },
        );
      });

    return {
      content: [{
        type: "text",
        text:
          `Fresh same-role session "${running.name}" launched in place of the saved conversation. `
          + `It does not inherit the old conversation; it continues from the role snapshot and handoff artifacts.\n\n`
          + `Replacement session: ${running.sessionFile}\n`
          + `Replaced session: ${params.sessionPath}`,
      }],
      details: recoveryDetails({
        id: running.id,
        name: running.name,
        status: "started",
        rollover: "fresh",
        originalSessionPath: params.sessionPath,
        replacementSessionPath: running.sessionFile,
        sessionFile: running.sessionFile,
        launchScriptFile: running.launchScriptFile,
        ...(lineageWarnings.length > 0 ? { lineageWarnings } : {}),
        ...(resumeWarnings.length > 0 ? { resumeWarnings } : {}),
      }),
    };
  }

  // Entry count before resuming, so the result only covers new messages.
  const entryCountBefore = getNewEntries(params.sessionPath, 0).length;

  const surface = createSurface(name);
  await new Promise<void>((resolve) => setTimeout(resolve, getShellReadyDelayMs()));

  const parts = buildResumePiArgs(params.sessionPath, resolvedModel?.argument);

  const subagentDonePath = join(SUBAGENTS_DIR, "subagent-done.ts");
  parts.push("-e", shellEscape(subagentDonePath));

  const sessionId = ctx.sessionManager.getSessionId();
  const artifactDir = getArtifactDir(ctx.sessionManager.getSessionDir(), sessionId);
  const activityFile = getSubagentActivityFile(artifactDir, id);
  mkdirSync(dirname(activityFile), { recursive: true });

  const safeName = toSafeFileName(name, "resume");
  if (
    restoration.roleBody &&
    (restoration.systemPromptMode === "append" || restoration.systemPromptMode === "replace")
  ) {
    const flag = restoration.systemPromptMode === "replace"
      ? "--system-prompt"
      : "--append-system-prompt";
    const syspromptPath = join(
      artifactDir,
      "subagent-resume",
      `${safeName}-sysprompt-${fileTimestamp()}.md`,
    );
    mkdirSync(dirname(syspromptPath), { recursive: true });
    writeFileSync(syspromptPath, restoration.roleBody, "utf8");
    parts.push(flag, shellEscape(syspromptPath));
  }

  let resumeMsgFile: string | undefined;
  if (params.message) {
    resumeMsgFile = join(artifactDir, "subagent-resume", `${safeName}-${fileTimestamp()}.md`);
    mkdirSync(dirname(resumeMsgFile), { recursive: true });
    writeFileSync(resumeMsgFile, params.message, "utf8");
    parts.push(shellEscape(`@${resumeMsgFile}`));
  }

  const resumeEnvParts: string[] = [];
  if (restoration.agentDir && existsSync(restoration.agentDir)) {
    resumeEnvParts.push(`PI_CODING_AGENT_DIR=${shellEscape(restoration.agentDir)}`);
  } else if (process.env.PI_CODING_AGENT_DIR) {
    resumeEnvParts.push(`PI_CODING_AGENT_DIR=${shellEscape(process.env.PI_CODING_AGENT_DIR)}`);
  }
  if (restoration.denyTools.length > 0) {
    resumeEnvParts.push(`PI_DENY_TOOLS=${shellEscape(restoration.denyTools.join(","))}`);
  }
  resumeEnvParts.push(`PI_SUBAGENT_NAME=${shellEscape(name)}`);
  if (restoration.agentName) {
    resumeEnvParts.push(`PI_SUBAGENT_AGENT=${shellEscape(restoration.agentName)}`);
  }
  resumeEnvParts.push(`PI_SUBAGENT_SESSION=${shellEscape(params.sessionPath)}`);
  resumeEnvParts.push(`PI_SUBAGENT_ID=${shellEscape(id)}`);
  resumeEnvParts.push(`PI_SUBAGENT_ACTIVITY_FILE=${shellEscape(activityFile)}`);
  if (autoExit) {
    resumeEnvParts.push(`PI_SUBAGENT_AUTO_EXIT=1`);
  }
  const resumeEnvPrefix = resumeEnvParts.join(" ") + " ";

  const resumeCommand = parts.join(" ");
  const cdPrefix = restoration.cwd ? `cd ${shellEscape(restoration.cwd)} && ` : "";
  const command = `${cdPrefix}${resumeEnvPrefix}${resumeCommand}; echo '__SUBAGENT_DONE_'$?'__'`;
  const launchScriptFile = join(artifactDir, "subagent-scripts", `${safeName}-resume-${Date.now()}.sh`);
  sendLongCommand(surface, command, {
    scriptPath: launchScriptFile,
    scriptPreamble: [
      `# Subagent resume script for ${name}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Session: ${params.sessionPath}`,
      `# Surface: ${surface}`,
      ...(resumeMsgFile ? [`# Resume message file: ${resumeMsgFile}`] : []),
    ].join("\n"),
  });

  const running: RunningSubagent = {
    id,
    name,
    task: params.message ?? "resumed session",
    surface,
    startTime,
    sessionFile: params.sessionPath,
    launchScriptFile,
    activityFile,
    interactive,
    statusState: createStatusState({ source: "pi", startTimeMs: startTime }),
  };
  if (phaseBoundary) running.phaseBoundary = phaseBoundary;
  runningSubagents.set(id, running);
  startWidgetRefresh();
  startStatusRefresh(pi);

  const watcherAbort = new AbortController();
  running.abortController = watcherAbort;

  watchSubagent(running, watcherAbort.signal)
    .then((result) => {
      updateWidget();

      const boundary = describeRunningPhaseBoundary(running);

      if (result.ping) {
        sendSubagentPing(pi, result, undefined, params.sessionPath, boundary);
        return;
      }

      const newEntries = getNewEntries(params.sessionPath, entryCountBefore);
      const assistantResponse = findLastAssistantMessage(newEntries);
      if (
        profileRead.status === "ok" &&
        result.exitCode === 0 &&
        !result.errorMessage &&
        assistantResponse !== null
      ) {
        try {
          updateLaunchProfile(params.sessionPath, (stored) =>
            updateProfileAfterSuccessfulResponse(stored, {
              ...(resolvedModel?.selection ? { selection: resolvedModel.selection } : {}),
              resources: currentResources,
              ...(fit ? { contextEstimate: toContextEstimateRecord(fit) } : {}),
              ...(recovery ? { previousFailure: recovery.failure } : {}),
            }));
        } catch {
          // Profile updates are best-effort; the response is already complete.
        }
        if (recovery && resolvedModel?.selection) {
          applyWorkflowRecoveryOverrideForPhase(
            recovery.phase,
            resolvedModel.selection,
            recovery.projectRoot,
          );
        }
      }
      const summary =
        assistantResponse ??
        (result.errorMessage
          ? `Subagent error: ${result.errorMessage}`
          : result.exitCode === 0
            ? "Resumed session exited without new output"
            : `Resumed session exited with code ${result.exitCode}`);
      const usage = resolveUsageDetails(result, ctx);
      const presentation = resolveResultPresentation(
        { ...result, summary, sessionFile: params.sessionPath, ...(usage ? { usage } : {}) },
        name,
      );
      const content = boundary?.violationText
        ? `${boundary.violationText}\n\n${presentation}`
        : presentation;

      pi.sendMessage(
        {
          customType: "subagent_result",
          content,
          display: true,
          details: recoveryDetails({
            name,
            task: params.message ?? "resumed session",
            exitCode: result.exitCode,
            elapsed: result.elapsed,
            sessionFile: params.sessionPath,
            ...(result.errorMessage
              ? {
                errorMessage: result.errorMessage,
                failureKind: classifyProviderFailure(result.errorMessage),
              }
              : {}),
            ...(usage ? { usage } : {}),
            ...(boundary ? boundary.details : {}),
          }),
        },
        { triggerTurn: true, deliverAs: "steer" },
      );
    })
    .catch((err) => {
      updateWidget();
      const message = err instanceof Error ? err.message : String(err);
      pi.sendMessage(
        {
          customType: "subagent_result",
          content: `Resume error: ${message}`,
          display: true,
          details: recoveryDetails({ name, error: message }),
        },
        { triggerTurn: true, deliverAs: "steer" },
      );
    });

  return {
    content: [{ type: "text", text: `Session "${name}" resumed.` }],
    details: recoveryDetails({
      id,
      name,
      sessionPath: params.sessionPath,
      launchScriptFile,
      status: "started",
      ...(resumeWarnings.length > 0 ? { resumeWarnings } : {}),
    }),
  };
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
  },
): Promise<RunningSubagent> {
  const params = normalizeSubagentParams(rawParams);
  const startTime = Date.now();
  const id = Math.random().toString(16).slice(2, 10);

  const rollover = options?.rolloverFrom;
  const agentDefs = !rollover && params.agent ? loadAgentDefaults(params.agent) : null;
  const configuredModel = options?.resolvedModel
    ? options.resolvedModel.selection.model
    : params.model ?? agentDefs?.model;
  const effectiveTools = rollover ? undefined : params.tools ?? agentDefs?.tools;
  const effectiveSkills = rollover
    ? rollover.stable.primarySkill?.name
    : params.skills ?? agentDefs?.skills;
  const effectiveInteractive = rollover
    ? rollover.stable.controls.interactive
    : resolveEffectiveInteractive(params, agentDefs);
  const autoExitForChild = rollover ? rollover.stable.controls.autoExit : agentDefs?.autoExit;

  const sessionFile = ctx.sessionManager.getSessionFile();
  if (!sessionFile) throw new Error("No session file");
  const sessionId = ctx.sessionManager.getSessionId();
  const artifactDir = getArtifactDir(ctx.sessionManager.getSessionDir(), sessionId);

  const resolvedPaths = resolveSubagentPaths(params, agentDefs);
  const effectiveCwd = resolvedPaths.effectiveCwd;
  // A rollover restores the original working directory and Pi config dir
  // instead of re-deriving them from current agent frontmatter.
  const effectiveAgentDir = rollover ? rollover.stable.agentDir : resolvedPaths.effectiveAgentDir;
  const localAgentDir = rollover
    ? (existsSync(rollover.stable.agentDir) ? rollover.stable.agentDir : null)
    : resolvedPaths.localAgentDir;
  const targetCwdForSession = effectiveCwd ?? ctx.cwd;
  const sessionDir = getDefaultSessionDirFor(targetCwdForSession, effectiveAgentDir);

  // Deterministic session file path so parallel launches never race.
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 23) + "Z";
  const uuid = [
    id,
    Math.random().toString(16).slice(2, 10),
    Math.random().toString(16).slice(2, 10),
    Math.random().toString(16).slice(2, 6),
  ].join("-");
  const subagentSessionFile = join(sessionDir, `${timestamp}_${uuid}.jsonl`);

  const surfacePreCreated = !!options?.surface;
  const surface = options?.surface ?? createSurface(params.name);
  if (!surfacePreCreated) {
    await new Promise<void>((resolve) => setTimeout(resolve, getShellReadyDelayMs()));
  }

  const launchBehavior = resolveLaunchBehavior(params, agentDefs);

  if (launchBehavior.seededSessionMode) {
    seedSubagentSessionFile({
      mode: launchBehavior.seededSessionMode,
      parentSessionFile: sessionFile,
      childSessionFile: subagentSessionFile,
      childCwd: targetCwdForSession,
    });
  }

  const activityFile = getSubagentActivityFile(artifactDir, id);
  mkdirSync(dirname(activityFile), { recursive: true });
  const { inheritsConversationContext } = launchBehavior;

  // Only full-context fork mode inherits prior conversation state.
  // Blank-session modes need the wrapper instructions.
  const modeHint = autoExitForChild
    ? "Complete your task autonomously."
    : "Complete your task. When finished, call the subagent_done tool. The user can interact with you at any time.";
  const summaryInstruction = autoExitForChild
    ? "Your FINAL assistant message should summarize what you accomplished."
    : "Your FINAL assistant message (before calling subagent_done or before the user exits) should summarize what you accomplished.";
  const denySet = rollover
    ? new Set(rollover.stable.controls.denyTools)
    : resolveDenyTools(agentDefs);
  const identity = rollover
    ? (rollover.stable.roleBody || null)
    : agentDefs?.body ?? params.systemPrompt ?? null;
  const systemPromptMode = rollover ? rollover.stable.systemPromptMode : agentDefs?.systemPromptMode;
  // A stored "message" mode embeds the role in the task text, like an
  // agent-less spawn; only "append"/"replace" use a system-prompt file.
  const systemPromptFileMode =
    systemPromptMode === "append" || systemPromptMode === "replace" ? systemPromptMode : undefined;
  const identityInSystemPrompt = systemPromptFileMode && identity;
  const roleBlock = identity && !identityInSystemPrompt ? `\n\n${identity}` : "";
  const fullTask = inheritsConversationContext
    ? params.task
    : `${roleBlock}\n\n${modeHint}\n\n${params.task}\n\n${summaryInstruction}`.trim();

  const safeName = toSafeFileName(params.name || "subagent", "subagent");
  const launchScriptFile = join(artifactDir, "subagent-scripts", `${safeName}-${id}.sh`);
  const piModelArgument = options?.resolvedModel?.argument ?? resolvePiModelArgument(params, agentDefs, {
    model: ctx.model,
    thinkingLevel: ctx.thinkingLevel,
  });
  const launchProfile = buildLaunchProfile({
    displayName: params.name,
    ...(rollover
      ? (rollover.stable.agentName ? { agentName: rollover.stable.agentName } : {})
      : params.agent
        ? { agentName: params.agent }
        : {}),
    roleBody: identity ?? "",
    systemPromptMode: rollover ? rollover.stable.systemPromptMode : agentDefs?.systemPromptMode ?? "message",
    cwd: targetCwdForSession,
    agentDir: effectiveAgentDir,
    controls: rollover
      ? {
        ...rollover.stable.controls,
        // A rollover child is always a standalone session, never a fork.
        sessionMode: launchBehavior.sessionMode,
      }
      : {
        ...(agentDefs?.spawning === undefined ? {} : { spawning: agentDefs.spawning }),
        denyTools: [...denySet].sort((first, second) => first.localeCompare(second)),
        ...(agentDefs?.autoExit === undefined ? {} : { autoExit: agentDefs.autoExit }),
        interactive: effectiveInteractive,
        sessionMode: launchBehavior.sessionMode,
      },
    effectiveSkills,
    modelArgument: piModelArgument,
    originalSessionPath: subagentSessionFile,
    resources: collectResourceFingerprints(ctx.pi, effectiveSkills),
    ...(options?.workflow ? { workflow: options.workflow } : {}),
  });

  // ── Claude Code CLI path ──
  if (agentDefs?.cli === "claude") {
    const sentinelFile = `/tmp/pi-claude-${id}-done`;
    const pluginDir = join(SUBAGENTS_DIR, "plugin");

    const cmdParts: string[] = [];
    cmdParts.push(`PI_CLAUDE_SENTINEL=${shellEscape(sentinelFile)}`);
    cmdParts.push("claude");
    cmdParts.push("--dangerously-skip-permissions");

    if (existsSync(pluginDir)) {
      cmdParts.push("--plugin-dir", shellEscape(pluginDir));
    }

    if (configuredModel) {
      cmdParts.push("--model", shellEscape(configuredModel));
    }

    const sp = params.systemPrompt ?? agentDefs.body;
    if (sp) {
      cmdParts.push("--append-system-prompt", shellEscape(sp));
    }

    if (params.resumeSessionId) {
      cmdParts.push("--resume", shellEscape(params.resumeSessionId));
    }

    // Always pass the task as the prompt. For resumed sessions it is the follow-up.
    cmdParts.push(shellEscape(params.task));

    const cdPrefix = effectiveCwd ? `cd ${shellEscape(effectiveCwd)} && ` : "";
    const command = `${cdPrefix}${cmdParts.join(" ")}; echo '__SUBAGENT_DONE_'$?'__'`;

    writeLaunchProfile(subagentSessionFile, launchProfile);
    try {
      sendLongCommand(surface, command, {
        scriptPath: launchScriptFile,
        scriptPreamble: [
          `# Claude Code subagent launch script for ${params.name}`,
          `# Generated: ${new Date().toISOString()}`,
          `# Surface: ${surface}`,
        ].join("\n"),
      });
    } catch (error) {
      removeLaunchProfile(subagentSessionFile);
      throw error;
    }

    const running: RunningSubagent = {
      id,
      name: params.name,
      task: params.task,
      agent: params.agent,
      surface,
      startTime,
      sessionFile: subagentSessionFile,
      launchScriptFile,
      cli: "claude",
      sentinelFile,
      interactive: effectiveInteractive,
      statusState: createStatusState({ source: "claude", startTimeMs: startTime }),
    };

    runningSubagents.set(id, running);
    return running;
  }

  // ── pi CLI path ──
  const parts: string[] = ["pi"];
  parts.push("--session", shellEscape(subagentSessionFile));

  const subagentDonePath = join(SUBAGENTS_DIR, "subagent-done.ts");
  parts.push("-e", shellEscape(subagentDonePath));

  if (piModelArgument) {
    parts.push("--model", shellEscape(piModelArgument));
  }

  // Pass the agent body as a system prompt file. pi's --append-system-prompt
  // and --system-prompt read file contents when given a path.
  if (identityInSystemPrompt && identity) {
    const flag = systemPromptMode === "replace" ? "--system-prompt" : "--append-system-prompt";
    const syspromptPath = join(artifactDir, `context/${safeName}-sysprompt-${fileTimestamp()}.md`);
    mkdirSync(dirname(syspromptPath), { recursive: true });
    writeFileSync(syspromptPath, identity, "utf8");
    parts.push(flag, shellEscape(syspromptPath));
  }

  const toolAllowlist = buildSubagentToolAllowlist(effectiveTools);
  if (toolAllowlist) {
    parts.push("--tools", shellEscape(toolAllowlist));
  }

  // Env prefix: denied tools, subagent identity, config dir propagation.
  const envParts: string[] = [];

  if (localAgentDir && existsSync(localAgentDir)) {
    envParts.push(`PI_CODING_AGENT_DIR=${shellEscape(localAgentDir)}`);
  } else if (process.env.PI_CODING_AGENT_DIR) {
    envParts.push(`PI_CODING_AGENT_DIR=${shellEscape(process.env.PI_CODING_AGENT_DIR)}`);
  }

  if (denySet.size > 0) {
    envParts.push(`PI_DENY_TOOLS=${shellEscape([...denySet].join(","))}`);
  }
  envParts.push(`PI_SUBAGENT_NAME=${shellEscape(params.name)}`);
  const childAgentName = rollover ? rollover.stable.agentName : params.agent;
  if (childAgentName) {
    envParts.push(`PI_SUBAGENT_AGENT=${shellEscape(childAgentName)}`);
  }
  if (autoExitForChild) {
    envParts.push(`PI_SUBAGENT_AUTO_EXIT=1`);
  }
  envParts.push(`PI_SUBAGENT_SESSION=${shellEscape(subagentSessionFile)}`);
  envParts.push(`PI_SUBAGENT_ID=${shellEscape(id)}`);
  envParts.push(`PI_SUBAGENT_ACTIVITY_FILE=${shellEscape(activityFile)}`);
  envParts.push(`PI_SUBAGENT_SURFACE=${shellEscape(surface)}`);
  const envPrefix = envParts.join(" ") + " ";

  // Task handoff. Fork mode passes the task directly (it inherits the parent
  // conversation). Blank-session modes write the wrapped task to an artifact
  // file; with skills the text is passed inline instead (see buildPiPromptArgs).
  let taskArg: string;
  if (launchBehavior.taskDelivery === "direct") {
    taskArg = fullTask;
  } else {
    const artifactPath = join(artifactDir, `context/${safeName}-${fileTimestamp()}.md`);
    mkdirSync(dirname(artifactPath), { recursive: true });
    writeFileSync(artifactPath, fullTask, "utf8");
    taskArg = `@${artifactPath}`;
  }

  for (const promptArg of buildPiPromptArgs({
    effectiveSkills,
    taskDelivery: launchBehavior.taskDelivery,
    taskArg,
    taskText: fullTask,
  })) {
    parts.push(shellEscape(promptArg));
  }

  const cdPrefix = effectiveCwd ? `cd ${shellEscape(effectiveCwd)} && ` : "";

  const piCommand = cdPrefix + envPrefix + parts.join(" ");
  const command = `${piCommand}; echo '__SUBAGENT_DONE_'$?'__'`;
  writeLaunchProfile(subagentSessionFile, launchProfile);
  try {
    sendLongCommand(surface, command, {
      scriptPath: launchScriptFile,
      scriptPreamble: [
        `# Subagent launch script for ${params.name}`,
        `# Generated: ${new Date().toISOString()}`,
        `# Session: ${subagentSessionFile}`,
        `# Surface: ${surface}`,
      ].join("\n"),
    });
  } catch (error) {
    removeLaunchProfile(subagentSessionFile);
    throw error;
  }

  const running: RunningSubagent = {
    id,
    name: params.name,
    task: params.task,
    agent: params.agent,
    surface,
    startTime,
    sessionFile: subagentSessionFile,
    launchScriptFile,
    activityFile,
    interactive: effectiveInteractive,
    statusState: createStatusState({ source: "pi", startTimeMs: startTime }),
  };

  runningSubagents.set(id, running);
  return running;
}

const CLAUDE_SESSIONS_DIR = join(homedir(), ".pi", "agent", "sessions", "claude-code");

function copyClaudeSession(sentinelFile: string): string | null {
  try {
    const transcriptFile = sentinelFile + ".transcript";
    if (!existsSync(transcriptFile)) return null;
    const transcriptPath = readFileSync(transcriptFile, "utf-8").trim();
    if (!transcriptPath || !existsSync(transcriptPath)) return null;
    mkdirSync(CLAUDE_SESSIONS_DIR, { recursive: true });
    const filename = transcriptPath.split("/").pop() ?? `claude-${Date.now()}.jsonl`;
    const dest = join(CLAUDE_SESSIONS_DIR, filename);
    copyFileSync(transcriptPath, dest);
    return filename;
  } catch {
    return null;
  }
}

function fallbackSummary(result: { exitCode: number; errorMessage?: string }): string {
  if (result.errorMessage) return `Subagent error: ${result.errorMessage}`;
  return result.exitCode === 0
    ? "Sub-agent exited without output"
    : `Sub-agent exited with code ${result.exitCode}`;
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
  const { name, task, surface, startTime, sessionFile } = running;

  try {
    const result = await pollForExit(surface, AbortSignal.any([signal, getModuleAbortSignal()]), {
      interval: 1000,
      sessionFile,
      sentinelFile: running.sentinelFile,
      onTick() {
        observeRunningSubagent(running);
      },
    });

    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    if (running.cli === "claude") {
      let summary = "";

      if (running.sentinelFile) {
        try {
          summary = readFileSync(running.sentinelFile, "utf-8").trim();
        } catch {
          // The sentinel summary is optional; screen capture is the fallback.
        }
      }

      if (!summary) {
        summary = readScreen(surface, 200)
          .replace(/__SUBAGENT_DONE_\d+__/, "")
          .trimEnd();
      }

      const responded = Boolean(summary);
      if (!summary) {
        summary = result.exitCode === 0
          ? "Claude Code exited without output"
          : `Claude Code exited with code ${result.exitCode}`;
      }

      let claudeSessionId: string | null = null;
      if (running.sentinelFile) {
        claudeSessionId = copyClaudeSession(running.sentinelFile);
        try {
          unlinkSync(running.sentinelFile);
        } catch {
          // Cleanup is best-effort; the pane is closing regardless.
        }
        try {
          unlinkSync(running.sentinelFile + ".transcript");
        } catch {
          // Cleanup is best-effort; the pane is closing regardless.
        }
      }

      closeSurface(surface);
      runningSubagents.delete(running.id);

      return {
        name,
        task,
        summary,
        exitCode: result.exitCode,
        elapsed,
        responded,
        ...(claudeSessionId ? { claudeSessionId } : {}),
      };
    }

    let summary: string;
    let usage: SubagentUsageSummary | undefined;
    let responded = false;
    if (existsSync(sessionFile)) {
      const allEntries = getNewEntries(sessionFile, 0);
      const assistantMessage = findLastAssistantMessage(allEntries);
      responded = assistantMessage !== null;
      summary = assistantMessage ?? fallbackSummary(result);
      // T9: aggregate every completed assistant entry of the child session —
      // for a resumed session this is the same role session's cumulative
      // usage, and the latest entry fixes the current context tokens.
      const aggregated = summarizeSubagentUsage(allEntries);
      if (aggregated.requests > 0) usage = aggregated;
    } else {
      summary = fallbackSummary(result);
    }

    closeSurface(surface);
    runningSubagents.delete(running.id);

    return {
      name,
      task,
      summary,
      sessionFile,
      exitCode: result.exitCode,
      elapsed,
      responded,
      ping: result.ping,
      ...(usage ? { usage } : {}),
      ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
    };
  } catch (err) {
    try {
      closeSurface(surface);
    } catch {
      // The pane may already be gone after a tmux failure.
    }
    runningSubagents.delete(running.id);

    const message = err instanceof Error ? err.message : String(err);
    if (signal.aborted) {
      return {
        name,
        task,
        summary: "Subagent cancelled.",
        exitCode: 1,
        elapsed: Math.floor((Date.now() - startTime) / 1000),
        error: "cancelled",
        sessionFile,
      };
    }
    return {
      name,
      task,
      summary: `Subagent error: ${message}`,
      exitCode: 1,
      elapsed: Math.floor((Date.now() - startTime) / 1000),
      error: message,
    };
  }
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, "").trim();
}

const WORKFLOW_SKILL_PATH = join(SUBAGENTS_DIR, "workflow-skill.md");

function getActiveWorkflowRuntime(): WorkflowRuntimeState | null {
  return activeWorkflowRuntime;
}

function setActiveWorkflowRuntimeForTests(state: WorkflowRuntimeState | null): void {
  activeWorkflowRuntime = state;
}

function getActiveWorkflowRunId(): string | null {
  return activeWorkflowRunId;
}

function setActiveWorkflowRunIdForTests(runId: string | null): void {
  activeWorkflowRunId = runId;
}

function createWorkflowRunId(): string {
  return `workflow-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Record the latest active session path for a workflow phase. Skipped when no
 * workflow runtime is active or when the phase belongs to another project, so
 * a stale sidecar can never redirect a different workflow's state.
 */
function updateActiveWorkflowSession(
  phase: WorkflowPhase,
  sessionPath: string,
  projectRoot?: string,
): void {
  const state = activeWorkflowRuntime;
  if (!state) return;
  if (projectRoot && state.projectRoot !== projectRoot) return;
  activeWorkflowRuntime = updateWorkflowActiveSession(state, phase, sessionPath);
}

/**
 * Apply a successful recovery override to the active workflow runtime: the
 * replacement becomes that role's current default for the remainder of the
 * workflow. The saved project preset is never touched from recovery.
 */
function applyWorkflowRecoveryOverrideForPhase(
  phase: WorkflowPhase,
  selection: ModelSelection,
  projectRoot?: string,
): void {
  const state = activeWorkflowRuntime;
  if (!state) return;
  if (projectRoot && state.projectRoot !== projectRoot) return;
  activeWorkflowRuntime = applyWorkflowRecoveryOverride(state, phase, selection);
}

function formatWorkflowStartupConfig(
  state: WorkflowRuntimeState,
  workflowRunId?: string,
): string {
  const lines = [
    `Policy: ${state.policy}`,
    `Assignment source: ${state.assignmentSource}`,
  ];
  if (workflowRunId) lines.push(`Run ID: ${workflowRunId}`);
  if (state.currentAssignments) {
    lines.push("Current role defaults:");
    for (const [role, selection] of Object.entries(state.currentAssignments)) {
      const thinking = selection.thinking ? `:${selection.thinking}` : "";
      lines.push(`- ${role}: ${selection.provider}/${selection.model}${thinking}`);
    }
  }
  lines.push(
    "Workflow agents listed above receive these models automatically when spawned with their agent name and this Run ID. Pass `workflowRunId` on every fresh workflow phase launch. Do not pass `model` for ordinary workflow phase launches.",
  );
  return lines.join("\n");
}

/** Wrap the bundled workflow prompt the way pi expands a `/skill:` command. */
function buildWorkflowMessage(
  request: string,
  skillPath = WORKFLOW_SKILL_PATH,
  workflowState?: WorkflowRuntimeState,
  workflowRunId?: string,
): string {
  const content = stripFrontmatter(readFileSync(skillPath, "utf8"));
  const config = workflowState
    ? `<workflow-config>\n${formatWorkflowStartupConfig(workflowState, workflowRunId)}\n</workflow-config>\n\n`
    : "";
  return `<skill name="workflow" location="${skillPath}">\n${content}\n</skill>\n\n${config}${request}`;
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
  formatWorkflowStartupConfig,
  describeRunningPhaseBoundary,
  capturePhaseBoundarySnapshot,
  getActiveWorkflowRuntime,
  setActiveWorkflowRuntimeForTests,
  getActiveWorkflowRunId,
  setActiveWorkflowRunIdForTests,
  collectResourceFingerprints,
  parseLegacyModelSelection,
  resolvePrimarySkill,
  launchSubagent,
  runningSubagents,
  formatElapsed,
  stripFrontmatter,
  buildWorkflowMessage,
  WORKFLOW_SKILL_PATH,
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

const SUBAGENT_RECOVER_DESCRIPTION =
  "Recover a failed /workflow phase session after quota/usage exhaustion or exhausted provider retries. " +
  "Shows phase, provider, model, failure, saved session path, and context estimate, opens the shared model and thinking picker, " +
  "then resumes the saved session or starts a fresh same-role rollover through the context-fit gate. " +
  "Completed artifacts and the saved project preset are preserved; a successful replacement model becomes that role's default for the rest of the workflow. " +
  ASYNC_TOOL_CONTRACT;

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
  pi.on("session_start", (_event, ctx) => {
    latestCtx = ctx;
    // /new, /resume, and /fork tore the previous session down through
    // session_shutdown without re-importing this module. Re-arm the poll-abort
    // controller so subagent spawns in this session can watch their panes.
    rearmModuleAbortController();
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
    runningSubagents.clear();
    activeWorkflowRuntime = null;
    activeWorkflowRunId = null;
  });

  // Tools denied via PI_DENY_TOOLS (set by the parent from agent frontmatter).
  const deniedTools = new Set(
    (process.env.PI_DENY_TOOLS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const shouldRegister = (name: string) => !deniedTools.has(name);

  function sendPing(
    result: SubagentResult,
    agent: string | undefined,
    sessionPath: string | undefined,
    boundary?: PhaseBoundaryOutcome,
  ) {
    sendSubagentPing(pi, result, agent, sessionPath, boundary);
  }

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
        // Prevent self-spawning (e.g. implementer spawning another implementer).
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
        let workflowMetadata: LaunchProfileWorkflowMetadata | undefined;
        if (
          params.workflowRunId
          && activeWorkflowRunId
          && params.workflowRunId !== activeWorkflowRunId
        ) {
          return {
            content: [{
              type: "text",
              text: "Error: this workflow run token is no longer active. Start or continue the current /workflow run.",
            }],
            details: { error: "stale workflow run token" },
          };
        }
        const workflowRunMatches = activeWorkflowRunId === null
          ? activeWorkflowRuntime !== null
          : params.workflowRunId === activeWorkflowRunId;
        const workflowPhase = activeWorkflowRuntime && workflowRunMatches
          ? workflowPhaseForAgent(params.agent)
          : undefined;
        // Agent frontmatter for this spawn, loaded once for both the explicit
        // model branch and the per-agent configured-default branch below.
        const spawnAgentDefs = params.agent ? loadAgentDefaults(params.agent) : null;
        if (workflowPhase && activeWorkflowRuntime) {
          try {
            resolvedModel = await resolveWorkflowPhaseSelection(
              ctx,
              activeWorkflowRuntime,
              workflowPhase,
            );
            const baseMetadata = buildWorkflowMetadata(
              activeWorkflowRuntime,
              workflowPhase,
              resolvedModel,
            );
            workflowMetadata = params.workflowArtifacts
              ? {
                ...baseMetadata,
                artifacts: {
                  ...baseMetadata.artifacts,
                  ...normalizeWorkflowArtifacts(params.workflowArtifacts),
                },
              }
              : baseMetadata;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              content: [{ type: "text", text: `Error: ${message}` }],
              details: { error: "workflow model selection failed", message },
            };
          }
        } else if (params.model) {
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

        // T7: phase-boundary baseline for artifact phases (planner, task
        // writer, reviewer), taken before the child can touch the worktree.
        // The implementer stays exempt: TASKS.md governs its scope.
        const phaseBoundary = workflowMetadata
          ? capturePhaseBoundarySnapshot(
              workflowMetadata.phase,
              workflowMetadata.projectRoot ?? ctx.cwd,
              workflowArtifactForPhase(workflowMetadata),
            )
          : undefined;

        const running = await launchSubagent(
          params,
          { ...ctx, pi },
          {
            ...(resolvedModel ? { resolvedModel } : {}),
            ...(workflowMetadata ? { workflow: workflowMetadata } : {}),
          },
        );
        if (phaseBoundary) running.phaseBoundary = phaseBoundary;

        // The workflow runtime tracks the latest active session per phase so
        // later resumes and recoveries target the replacement, not a stale path.
        if (workflowMetadata) {
          updateActiveWorkflowSession(
            workflowMetadata.phase,
            running.sessionFile,
            workflowMetadata.projectRoot,
          );
        }

        // Separate AbortController for the watcher: the tool's signal completes when we return.
        const watcherAbort = new AbortController();
        running.abortController = watcherAbort;

        startWidgetRefresh();
        startStatusRefresh(pi);

        watchSubagent(running, watcherAbort.signal)
          .then((result) => {
            updateWidget();

            const boundary = describeRunningPhaseBoundary(running);

            if (result.ping) {
              sendPing(result, running.agent, result.sessionFile, boundary);
              return;
            }

            const usage = resolveUsageDetails(result, ctx);
            const base = resolveResultPresentation(
              { ...result, ...(usage ? { usage } : {}) },
              running.name,
            );
            const presentation = boundary?.violationText
              ? `${boundary.violationText}\n\n${base}`
              : base;

            pi.sendMessage(
              {
                customType: "subagent_result",
                content: presentation,
                display: true,
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
              },
              { triggerTurn: true, deliverAs: "steer" },
            );
          })
          .catch((err) => {
            updateWidget();
            const message = err instanceof Error ? err.message : String(err);
            pi.sendMessage(
              {
                customType: "subagent_result",
                content: `Sub-agent "${running.name}" error: ${message}`,
                display: true,
                details: { name: running.name, task: running.task, error: message },
              },
              { triggerTurn: true, deliverAs: "steer" },
            );
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
        workflowArtifacts: Type.Optional(
          Type.Object({
            plan: Type.Optional(Type.String({ description: "Absolute PLAN.md path" })),
            tasks: Type.Optional(Type.String({ description: "Absolute TASKS.md path" })),
            review: Type.Optional(Type.String({ description: "Absolute REVIEW.md path" })),
            baseRef: Type.Optional(Type.String({ description: "Git base ref" })),
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

  // ── subagent_recover tool ──
  if (shouldRegister("subagent_recover"))
    pi.registerTool({
      name: "subagent_recover",
      label: "Recover Subagent",
      description: SUBAGENT_RECOVER_DESCRIPTION,
      promptSnippet: SUBAGENT_RECOVER_DESCRIPTION,
      parameters: Type.Object({
        sessionPath: Type.String({
          description:
            "Path to the failed workflow phase's session .jsonl file (the subagent_result details.sessionFile)",
        }),
        failure: Type.Optional(
          Type.String({
            description:
              "The provider/agent error message from the failed subagent_result (details.errorMessage)",
          }),
        ),
        message: Type.Optional(
          Type.String({
            description:
              "Optional continuation message for the recovered session. Default: a role continuation instruction.",
          }),
        ),
        name: Type.Optional(
          Type.String({ description: "Display name for the recovered pane. Default: the saved role display name" }),
        ),
      }),

      renderCall(args, theme) {
        const name = args.name ?? "Recover";
        return new Text(
          renderToolStateRow(theme, {
            name,
            state: "starting",
            label: "recovery gate",
          }),
          0,
          0,
        );
      },

      renderResult(result, _opts, theme) {
        const details = result.details as
          | { name?: string; status?: string; rollover?: string }
          | undefined;
        const name = details?.name ?? "Recover";

        if (details?.status === "started") {
          return new Text(
            renderToolStateRow(theme, {
              name,
              state: "starting",
              label: details?.rollover === "fresh" ? "fresh rollover started" : "recovery resumed",
            }),
            0,
            0,
          );
        }

        if (details?.status === "cancelled" || details?.status === "not-opened") {
          return new Text(
            renderToolStateRow(theme, {
              name,
              state: "help",
              label: details.status === "cancelled" ? "recovery cancelled" : "recovery not opened",
            }),
            0,
            0,
          );
        }

        return renderToolFallback(result, theme);
      },

      async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
        if (!existsSync(params.sessionPath)) {
          return {
            content: [
              { type: "text", text: `Error: session file not found: ${params.sessionPath}` },
            ],
            details: { error: "session not found" },
          };
        }

        const profileRead = readLaunchProfile(params.sessionPath);
        if (profileRead.status === "missing") {
          return {
            content: [{
              type: "text",
              text: "Error: this session has no launch-profile sidecar. Recover legacy sessions with subagent_resume and an explicit model.",
            }],
            details: { error: "no launch profile" },
          };
        }
        if (profileRead.status === "invalid") {
          return {
            content: [{ type: "text", text: `Error: ${profileRead.error}` }],
            details: { error: "invalid launch profile" },
          };
        }
        const workflowMeta = profileRead.profile.workflow;
        if (!workflowMeta) {
          return {
            content: [{
              type: "text",
              text: "Error: this session does not belong to a /workflow phase. Resume it with subagent_resume instead.",
            }],
            details: { error: "not a workflow session" },
          };
        }

        const failureMessage =
          params.failure?.trim() || profileRead.profile.runtime.previousFailure?.message || "";
        const failureKind: ProviderFailureKind = failureMessage
          ? classifyProviderFailure(failureMessage)
          : "other";
        const failedSelection =
          profileRead.profile.runtime.lastModel ?? profileRead.profile.runtime.originalModel;
        const failure = buildProviderFailureRecord({
          kind: failureKind,
          message: failureMessage || "unknown provider failure",
          ...(failedSelection?.provider ? { provider: failedSelection.provider } : {}),
          ...(failedSelection?.model ? { model: failedSelection.model } : {}),
        });

        // Record the failure on the saved profile for diagnostics. Best-effort:
        // the recovery decision never depends on this write.
        try {
          updateLaunchProfile(params.sessionPath, (stored) => ({
            ...stored,
            runtime: { ...stored.runtime, previousFailure: failure },
          }));
        } catch {
          // Diagnostics only; recovery continues.
        }

        if (!shouldOpenRecoveryGate(failureKind)) {
          return {
            content: [{
              type: "text",
              text:
                `Failure classified as "${formatFailureKind(failureKind)}". The workflow recovery gate applies only to ` +
                `quota/usage exhaustion and exhausted normal retries. Tell the user the failure and ask whether to retry the phase; ` +
                `the saved session and all completed artifacts are preserved.`,
            }],
            details: {
              status: "not-opened",
              failureKind,
              phase: workflowMeta.phase,
              sessionPath: params.sessionPath,
            },
          };
        }

        if (!ctx.hasUI) {
          return {
            content: [{
              type: "text",
              text:
                "Error: workflow recovery needs interactive UI for the model and thinking picker. " +
                "Ask the user to fix the provider problem and retry the phase, or resume the session with subagent_resume " +
                "and an explicit provider/model[:thinking] value.",
            }],
            details: {
              error: "recovery needs interactive UI",
              failureKind,
              phase: workflowMeta.phase,
            },
          };
        }

        let estimate: SavedContextEstimate | undefined;
        try {
          estimate = estimateSavedSessionContext(params.sessionPath);
        } catch {
          estimate = undefined;
        }

        await ctx.ui?.notify?.(
          formatRecoverySummary({
            phase: workflowMeta.phase,
            failureKind,
            failure: failureMessage || "unknown provider failure",
            sessionPath: params.sessionPath,
            ...(failedSelection?.provider ? { provider: failedSelection.provider } : {}),
            ...(failedSelection?.model ? { model: failedSelection.model } : {}),
            ...(estimate ? { estimate } : {}),
          }),
          "error",
        );

        const choice = await ctx.ui.select(
          `Recover the workflow ${WORKFLOW_PHASE_LABELS[workflowMeta.phase]} phase?`,
          [RECOVERY_SELECT_MODEL, RECOVERY_STOP],
        );
        if (choice !== RECOVERY_SELECT_MODEL) {
          return {
            content: [{
              type: "text",
              text: "Recovery cancelled at the user gate. The saved session and all completed artifacts are preserved.",
            }],
            details: {
              status: "cancelled",
              failureKind,
              phase: workflowMeta.phase,
              sessionPath: params.sessionPath,
            },
          };
        }

        // The shared picker, context-fit gate, resume, and rollover machinery
        // all live in the resume implementation. Recovery only adds the
        // workflow bookkeeping it applies on success.
        return executeSubagentResume(
          pi,
          {
            sessionPath: params.sessionPath,
            ...(params.name ? { name: params.name } : {}),
            message: params.message ?? defaultRecoveryMessage(),
            model: "pick",
          },
          ctx,
          {
            failure,
            phase: workflowMeta.phase,
            ...(workflowMeta.projectRoot ? { projectRoot: workflowMeta.projectRoot } : {}),
          },
        );
      },
    });

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

  // /workflow: plan -> tasks -> implement -> review chain with four user gates
  pi.registerCommand("workflow", {
    description: "Run the plan → tasks → implement → review chain in subagent panes: /workflow <request>",
    handler: async (args, ctx) => {
      const request = args.trim();
      if (!request) {
        ctx.ui.notify("Usage: /workflow <request>", "warning");
        return;
      }
      if (!isTmuxAvailable()) {
        ctx.ui.notify(`/workflow needs tmux. ${muxSetupHint()}`, "error");
        return;
      }

      const startup = await chooseWorkflowStartup(ctx, ctx.cwd);
      if (startup.status !== "started") {
        activeWorkflowRuntime = null;
        activeWorkflowRunId = null;
        ctx.ui.notify(startup.reason, "warning");
        return;
      }
      activeWorkflowRuntime = startup.state;
      activeWorkflowRunId = createWorkflowRunId();

      try {
        const label = request.length > 40 ? request.slice(0, 40) + "…" : request;
        renameCurrentTab(` Workflow: ${label}`);
      } catch {
        // Cosmetic. The prompt renames the window per phase anyway.
      }

      pi.sendUserMessage(
        buildWorkflowMessage(
          request,
          WORKFLOW_SKILL_PATH,
          startup.state,
          activeWorkflowRunId,
        ),
      );
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
