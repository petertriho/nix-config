import { Type, type Static } from "typebox";

export const SubagentParams = Type.Object({
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

export type SubagentParamsType = Static<typeof SubagentParams>;

// Claude requires a description and prompt, but not a display name.
export const AgentParams = Type.Object({
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

export type AgentCall = Static<typeof AgentParams> & { mode?: string };

export function normalizeAgentCall(input: AgentCall): AgentCall {
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
export function normalizeSubagentParams(params: SubagentParamsType): SubagentParamsType {
  const normalized: SubagentParamsType = { ...params };
  for (const key of OPTIONAL_STRING_PARAMS) {
    const value = normalized[key];
    if (typeof value === "string" && value.trim() === "") {
      delete normalized[key];
    }
  }
  return normalized;
}
