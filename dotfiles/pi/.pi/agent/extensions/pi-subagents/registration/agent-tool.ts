import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isAbsolute } from "node:path";
import { AgentParams, normalizeAgentCall, type SubagentParamsType } from "./schemas.ts";
import { ASYNC_TOOL_CONTRACT } from "./descriptions.ts";
import { resolveEffectiveInteractive } from "../profiles/launch-policy.ts";
import type { AgentDiscovery } from "../profiles/discovery.ts";
import type { ExecutionRuntime } from "../runtime/execution.ts";
import type { OrdinaryTool } from "../runtime/ordinary-agents.ts";
import type { TeamRuntime } from "../runtime/teams.ts";
import type { TeamLauncher } from "../runtime/team-launch.ts";
import { activeAgentResult } from "../runtime/tool-results.ts";

export function registerAgentTool(
  pi: ExtensionAPI,
  discovery: AgentDiscovery,
  execution: ExecutionRuntime,
  ordinaryTool: OrdinaryTool,
  team: TeamRuntime,
  launchTeamAgent: TeamLauncher,
  shouldRegister: (name: string) => boolean
): void {
  const { loadAgentDefaults } = discovery;
  const { executeSubagentResume } = execution;
  const { memberMailbox } = team;
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
          return launchTeamAgent(params, defaults, agentName, ctx, signal);
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
}
