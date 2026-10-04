export const ASYNC_TOOL_CONTRACT =
  "This is a fire-and-forget async tool: the call returns immediately with only an acknowledgement. " +
  "When the sub-agent finishes, the harness AUTOMATICALLY delivers its result as a steer message that wakes you up and starts a new turn — you do not need to do anything to receive it. " +
  "DO NOT write polling loops, sleep/wait commands, tail/watch scripts, or repeatedly read session/log files to detect completion. DO NOT call ListAgents or any other tool to 'check' status. All of that is wasted work — the harness handles delivery for you. " +
  "DO NOT fabricate, assume, or summarize results after calling this tool. " +
  "After spawning, either end your turn immediately, or work on other independent tasks (including spawning more subagents in parallel). The harness will wake you with the result when it is ready.";

export const SUBAGENT_TOOL_DESCRIPTION = "Spawn a sub-agent in a dedicated tmux pane. " + ASYNC_TOOL_CONTRACT;

export const SUBAGENT_RESUME_DESCRIPTION =
  "Resume a previous sub-agent session in a new tmux pane. " +
  ASYNC_TOOL_CONTRACT +
  " Use when a sub-agent was cancelled or needs follow-up work. " +
  "When the saved session is at or above 65% of the selected model's context window, a gate offers " +
  "a fresh same-role rollover, resume anyway, another model, or stop; model selection shows the projected context ratio per model.";

export const SUBAGENT_INTERRUPT_DESCRIPTION =
  "Send Escape to the active turn of a currently running Pi-backed subagent. " +
  "The child pane, session, watcher, and running entry remain alive; this returns only a local acknowledgement " +
  "and does not emit a subagent_result solely because of this request.";

export const SUBAGENTS_LIST_DESCRIPTION =
  "List all available subagent definitions. " +
  "Scans the bundled agents, global ~/.pi/agent/agents/, and project-local .pi/agents/. " +
  "Later sources override earlier ones with the same name.";
