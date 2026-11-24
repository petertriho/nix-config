---
name: pi-tmux-agents
description: "Start pi agents in tmux windows and get their turn results back as follow-up messages: start an agent in a worktree or folder, send follow-ups, read its screen, interrupt, stop, and resume it, with the TmuxAgent tools. Use only when the user names tmux for pi agents or workers, such as \"tmux agents\", \"start a pi in tmux for each repo\", \"orchestrate this in tmux\", or \"send this to the tmux agent\". Do not use for pi subagents (the Agent tool of pi-subagents), for Claude Code workers (tmux-worker), or for ordinary parallel work."
---

# pi-tmux-agents

Run pi agents in tmux and act as their lead. `TmuxAgentSpawn` opens a
detached window in a tmux session, and starts pi there with your prompt. The
user can watch the window and type into it. Each time an agent ends a turn,
its result arrives in this session as a follow-up message, and a new turn of
yours starts. An agent never takes the focus of the user's tmux client.

The panel above the editor shows the agents of this session with their
status and the time since the last change.

## Preflight

1. Check that `TMUX` is set, with `printenv TMUX`. Outside tmux, tell the
   user and stop.
2. Check that the `TmuxAgent*` tools exist. pi registers them only in a lead
   session. A tmux agent, a tmux worker, or a pi subagent cannot start
   agents. When the tools are missing, tell the user and stop.

## Tools

| Tool | Effect | Result |
| ---- | ------ | ------ |
| `TmuxAgentSpawn` | Creates the tmux session when it is missing (detached, rooted at `session_dir`, which defaults to `cwd`). Adds a detached window in `cwd` (default: the current folder), and starts pi with the prompt. Without `session`, the window opens in your own tmux session. `model` and `thinking` default to the pi defaults. Each `pi_args` item passes one more argument to pi, and a resume passes it again. | The id, the target (`session:window`), and the pane. Notes from the CLI, such as a session name clash. |
| `TmuxAgentSend` | Puts the message in the inbox of the agent. An idle agent starts a turn. A working agent gets it as a follow-up in its current run. A stopped agent, or an agent whose window or pi is gone, is reopened on the same pi session. | `queued` or `reopened`. |
| `TmuxAgentRead` | Shows the last lines of the agent window (default 60). It only reads. | The screen text. |
| `TmuxAgentInterrupt` | Stops the running turn of the agent. When the agent waits on a dialog, it also cancels the dialog. When no turn runs, it does nothing. | `interrupt_requested` or `no_turn`. |
| `TmuxAgentStop` | Closes the agent window. The folder, the branch, and the pi session stay. | `stopped`. |
| `TmuxAgentList` | Lists the agents of this session with their status: `starting`, `working`, `waiting`, `idle`, `error`, `stopped`, or `dead`. | One row for each agent. |

`agent` is the id, or a name that only one agent has.

A result message has a headline, the final text of the turn, and a trailer:
`pi-tmux-agents: id=<id> target=<target> pane=<pane> turn=<n> event=<event>`.
The events are:

- `stop`: the turn ended.
- `error`: the turn ended with an error, such as an API error. The trailer
  also has `error=<message>`.
- `interrupted`: `TmuxAgentInterrupt` or the user stopped the turn.
- `waiting`: the agent waits on a dialog. The message has the dialog and the
  screen.
- `gone`: pi or its window is gone without a new turn.

## Procedure

1. Prepare a folder for each agent with the rules of the project. Do not let
   two agents edit one folder at the same time.
   - In `~/Work`, follow `~/Work/CLAUDE.md`: create the worktree in
     `~/Work/<repo>/worktrees/<dir>`, then pass `cwd: <worktree>`,
     `session: <repo>`, and `session_dir: ~/Work/<repo>`.
2. Write a self-contained prompt for each agent with the template below. The
   agent cannot see this conversation.
3. Start each agent with `TmuxAgentSpawn`. Give it a short `name`. Tell the
   user each target (`session:window`).
4. Wait for the results. They arrive as follow-up messages, and each one
   starts a turn of yours.
   - Do not poll, sleep, or call `TmuxAgentList` or `TmuxAgentRead` in a loop.
   - Do not run `pi-tmux-agents wait` or `pi-tmux-agents pull` in bash. They
     take the events away from this session, and the results then never
     arrive.
   - When you have nothing else to do, end your turn.
5. When a result arrives, relay it to the user. When the event is not
   `stop`, also give the event and the trailer. Review the work in the folder
   of the agent. Do not trust the report alone.
   - A turn end is not completion. A reply can end with an error, ask a
     question, report a blocker, or leave the task unfinished. When the
     instructions of the user cover the next step, continue the agent with
     `TmuxAgentSend`. Otherwise, ask the user.
   - When your review finds a problem, send the problem and its evidence to
     the agent. When the same problem remains after two follow-ups, report it
     to the user. Do not send a third follow-up for it.
6. Continue an agent with `TmuxAgentSend`. A message to an agent that is
   still working joins its current run, and one result comes for the run.
7. To check progress, use `TmuxAgentRead`. To stop a turn, use
   `TmuxAgentInterrupt`. An `interrupted` result then arrives.
8. Stop an agent that will be idle for a long time. An open agent keeps a pi
   process and its extensions in memory. `TmuxAgentStop` closes the window.
   The folder, the branch, and the pi session stay. Decide by yourself, and
   tell the user each agent that you stop.
   - Stop an agent when you reviewed its work and it has no next step, or
     when it will wait for more than about one hour, for example on a PR
     review or on another agent.
   - Keep an agent open while you send it follow-ups. A resume can miss the
     prompt cache, so a stop between quick turns costs more than it saves.
   - Keep an agent open while it runs a server or a background process. A
     stop ends these processes.
   - Keep an agent open while it waits on a dialog, while the user types into
     its window, or when the user asked to keep it open.
   - When an agent that you stopped has a next step, continue it with
     `TmuxAgentSend`. It reopens the agent on the same pi session.
   - Before you resume an agent that the user stopped, ask the user.
   - Never remove a worktree or delete a branch unless the user asks.
9. When tasks are independent, start several agents. Their results arrive
   one at a time.
10. Your task is done when each agent finished its task and you reviewed its
    work. An agent that the user stopped or took over also counts as done.
    Until then, do not report the whole task as done. When the user asked
    only to start agents, the task is done when they run. Before you report,
    stop each agent that has no next step (step 8).

## Agent prompt template

```markdown
You do <task> in <repository>.

## Where to work
- Work only in <folder>. It is on branch <branch>, from <base>. Do not edit
  other checkouts.
- Do not remove the worktree or delete the branch.
- If the sandbox blocks a write, stop and report the path that needs a grant.

## Read first
1. <plan or task file, with the sections that apply>
2. <ticket, issue, or spec>
3. <repository docs and precedent commits>

## How to implement
<approach, test command, conventions>

## Rules
- Do not add Jira work log entries, comment on Jira, or change a ticket. The
  lead does that.
- Do not refer to .artifacts, PLAN.md, TASKS.md, or task IDs in code,
  comments, commit messages, or PR descriptions.
- <commit, push, and PR rules: what the agent may do itself>

## Report
When you finish, reply with: the commit SHAs, the PR URL if any, each check
that you ran with its result, each acceptance check that you could not run
and why, and each deviation from the plan.
```

Keep the rules that the user gave for the work. Say what the agent may not
do, such as push or open a PR, when the user did not allow it.

## Edge cases

- **Waiting.** Only the user can answer the dialog, in the agent window. Tell
  the user the target and the dialog from the result. When the user answers,
  the next result arrives by itself. To cancel the dialog instead, use
  `TmuxAgentInterrupt`.
- **A message while a dialog is open.** The message waits in the inbox of
  the agent until the dialog closes. Then the agent gets it.
- **Gone.** When you did not stop the agent yourself, read the result and
  tell the user. Do not resume the agent by yourself. Ask the user first. The
  next `TmuxAgentSend` reopens the agent on the same pi session.
- **Starting for more than 2 minutes.** The panel shows the time. pi in the
  window may show an error, or the agent extension did not load, so the
  prompt did not start. Use `TmuxAgentRead`, and tell the user what the
  screen shows.
- **`/new`, `/resume`, or `/fork` in this session.** The agents belong to the
  pi session that started them. After a switch, the panel shows only the
  agents of the new session. The results of the other agents wait until
  their session is active again, and then they arrive.
- **The user typed into the window.** A result can come from a turn that the
  user started. When the reply does not answer your request, say so.
- **Session name clash.** When a tmux session with the name exists with
  another root folder, `TmuxAgentSpawn` still adds the window there, and its
  result has a note. Relay the note.
- **Model.** Agents use the pi default model. Set `model` or `thinking` only
  when the user asks.
- **State.** Each agent keeps its state in
  `~/.local/state/pi-tmux-agents/<id>/`. Do not edit it.
