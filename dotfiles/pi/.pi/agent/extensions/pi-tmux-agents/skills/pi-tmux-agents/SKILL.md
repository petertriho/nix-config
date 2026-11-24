---
name: pi-tmux-agents
description: "Start pi agents in tmux windows with the Agent tool and get their results back: a foreground call waits for the reply, and a background call returns it later as a follow-up message. Covers agent types (general-purpose, Explore, Plan, and project types), git worktree isolation, follow-ups with SendMessage, and reading, interrupting, stopping, and resuming agents. Use before you start agents for code changes, in worktrees, or several agents at once, and when the user names tmux for pi agents or workers, such as \"tmux agents\", \"start a pi in tmux for each repo\", or \"send this to the agent\". Do not use for Claude Code workers (tmux-worker)."
---

# pi-tmux-agents

Run pi agents in tmux and act as their lead. `Agent` opens a detached window
in a tmux session and starts pi there with your prompt. The user can watch
the window and type into it. An agent never takes the focus of the user's
tmux client.

The panel above the editor shows the agents of this session with their type,
their status, and the time since the last change.

## Preflight

1. Check that `TMUX` is set, with `printenv TMUX`. Outside tmux, tell the
   user and stop.
2. Check that the `Agent` and `SendMessage` tools exist. pi registers them
   only in a lead session. A tmux agent, a tmux worker, or a pi subagent
   cannot start agents. When the tools are missing, tell the user and stop.

## Tools

| Tool | Effect | Result |
| ---- | ------ | ------ |
| `Agent` | Starts an agent of `subagent_type` (default `general-purpose`) in a new window, with `prompt`. `description` is a short title. `name` defaults to a slug of the description. Without `session`, the window opens in your own tmux session. | Foreground: the reply of the first turn. Background: the id and the target at once. |
| `SendMessage` | Puts `message` in the inbox of the agent `to`. An idle agent starts a turn. A working agent gets it in its current run. A stopped agent, or an agent whose window or pi is gone, is reopened on the same pi session. | `queued` or `reopened` at once. The result of the turn arrives as a follow-up message. |
| `ListAgents` | Lists the agents of this session with their type, status, target, folder, and description. | One row for each agent. |
| `AgentRead` | Shows the last lines of the agent window (default 60). It only reads. | The screen text. |
| `AgentInterrupt` | Stops the running turn. When the agent waits on a dialog, it also cancels the dialog. When no turn runs, it does nothing. | `interrupt_requested` or `no_turn`. |
| `AgentStop` | Closes the agent window. The folder, the branch, and the pi session stay. | `stopped`. |

`to` and `agent` take the id, or a name that only one agent of this session
has.

## Foreground and background

- **Foreground** (the default): the `Agent` call waits for the end of the
  first turn and returns the reply. Several `Agent` calls in one message run
  at the same time. Use it when your next step needs the answer.
- **Background** (`run_in_background: true`): the call returns at once.
  The result arrives later as a follow-up message, and a new turn of yours
  starts. Use it for long work, or when you have other work to do meanwhile.
- Esc during a foreground call interrupts the agent. The call returns, and
  the agent stays open for `SendMessage`.
- When a foreground agent opens a dialog, the call returns "needs input" at
  once. The agent then works as a background agent: its later results arrive
  as follow-up messages.
- `SendMessage` is always background.

## Agent types

| Type | Tools | Window after the result |
| ---- | ----- | ----------------------- |
| `general-purpose` | The pi defaults | Stays open |
| `Explore` | `read`, `grep`, `find`, `ls` | Closes (auto-stop) |
| `Plan` | `read`, `grep`, `find`, `ls` | Closes (auto-stop) |

- `Explore` searches the code and answers with `path:line` evidence. `Plan`
  returns an implementation plan. Neither changes a file or runs a command.
- The `Agent` description lists the types of this session.
- A project can add types in `<project>/.pi/agents/*.md`. pi loads them only
  in a project that it trusts. A project type replaces a bundled type with
  the same name. The frontmatter has `name`, `description`, and optional
  `tools` (a comma list), `model`, `thinking`, and `auto-stop: true`. The body
  is appended to the system prompt of the agent.
- An auto-stop agent closes its window after each `stop` result. Its folder
  and pi session stay, and `SendMessage` reopens it.
- `model` and `thinking` of the call replace those of the type. Set them
  only when the user asks.

## Isolation

With `isolation: "worktree"`, `Agent` creates a git worktree of the
repository of `cwd`, and the agent works there.

- `worktree_path`: the folder of the worktree. The default is
  `<repository root>/.worktrees/<name>`. The default folder is added to
  `.git/info/exclude`.
- `branch`: the new branch. The default is `agent/<name>`.
- `base`: the start point, such as `origin/main`. The default is `HEAD` of
  `cwd`. A remote ref is fetched first.
- When `worktree_path` exists and is a worktree of the same repository on
  `branch`, the agent uses it. Otherwise an existing path fails the call.
- The result gives the worktree and the branch. pi-tmux-agents never removes
  a worktree or deletes a branch.

## Results

A follow-up result has a headline, the final text of the turn, and a
trailer:
`pi-tmux-agents: id=<id> target=<target> pane=<pane> turn=<n> event=<event>`.
A foreground `Agent` result has the same text and trailer. The events are:

- `stop`: the turn ended.
- `error`: the turn ended with an error, such as an API error. The trailer
  also has `error=<message>`.
- `interrupted`: `AgentInterrupt`, Esc, or the user stopped the turn.
- `waiting`: the agent waits on a dialog. The message has the dialog and the
  screen.
- `gone`: pi or its window is gone without a new turn.

## Procedure

1. Choose a type for each task. Use `Explore` for questions about the code,
   `Plan` for a plan, and `general-purpose` for changes.
2. Prepare a folder for each agent that changes files. Do not let two
   agents edit one folder at the same time.
   - Pass `isolation: "worktree"` for a code change.
   - Follow the rules of the project or the host for worktree paths and
     branch names. Pass `worktree_path`, `branch`, `base`, `session`, and
     `session_dir` when those rules set them.
3. Write a self-contained prompt for each agent with the template below. The
   agent cannot see this conversation.
4. Start each agent with `Agent`. Give a short `description`. Tell the user
   each target (`session:window`).
5. For a background agent, wait for the result. It arrives as a follow-up
   message and starts a turn of yours.
   - Do not poll, sleep, or call `ListAgents` or `AgentRead` in a loop.
   - Do not run `pi-tmux-agents wait` or `pi-tmux-agents pull` in bash. They
     take the events away from this session, and the results then never
     arrive.
   - When you have nothing else to do, end your turn.
6. When a result arrives, relay it to the user. When the event is not
   `stop`, also give the event and the trailer. Review the work in the folder
   of the agent. Do not trust the report alone.
   - A turn end is not completion. A reply can end with an error, ask a
     question, report a blocker, or leave the task unfinished. When the
     instructions of the user cover the next step, continue the agent with
     `SendMessage`. Otherwise, ask the user.
   - When your review finds a problem, send the problem and its evidence to
     the agent. When the same problem remains after two follow-ups, report it
     to the user. Do not send a third follow-up for it.
7. To check progress, use `AgentRead`. To stop a turn, use
   `AgentInterrupt`. An `interrupted` result then arrives.
8. Stop a `general-purpose` agent that will be idle for a long time. An open
   agent keeps a pi process and its extensions in memory. `AgentStop` closes
   the window. The folder, the branch, and the pi session stay. Decide by
   yourself, and tell the user each agent that you stop.
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
     `SendMessage`. It reopens the agent on the same pi session.
   - Before you resume an agent that the user stopped, ask the user.
   - Never remove a worktree or delete a branch unless the user asks.
9. When tasks are independent, start several agents in one message. Their
   results arrive one at a time.
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
- Do not refer to .artifacts, PLAN.md, TASKS.md, or task IDs in code,
  comments, commit messages, or PR descriptions.
- <commit, push, and PR rules: what the agent may do itself>

## Report
When you finish, reply with: the commit SHAs, the PR URL if any, each check
that you ran with its result, each acceptance check that you could not run
and why, and each deviation from the plan.
```

Keep the rules that the user gave for the work. Say what the agent may not
do, such as push or open a PR, when the user did not allow it. An `Explore`
or `Plan` prompt needs only the question, the folder, and the report.

## Edge cases

- **Waiting.** Only the user can answer the dialog, in the agent window. Tell
  the user the target and the dialog from the result. When the user answers,
  the next result arrives by itself. To cancel the dialog instead, use
  `AgentInterrupt`.
- **A message while a dialog is open.** The message waits in the inbox of
  the agent until the dialog closes. Then the agent gets it.
- **Gone.** When you did not stop the agent yourself, read the result and
  tell the user. Do not resume the agent by yourself. Ask the user first. The
  next `SendMessage` reopens the agent on the same pi session.
- **Starting for more than 2 minutes.** The panel shows the time. pi in the
  window may show an error, or the agent extension did not load, so the
  prompt did not start. Use `AgentRead`, and tell the user what the screen
  shows.
- **`/new`, `/resume`, or `/fork` in this session.** The agents belong to the
  pi session that started them. After a switch, the panel shows only the
  agents of the new session. The results of the other agents wait until
  their session is active again, and then they arrive.
- **The user typed into the window.** A result can come from a turn that the
  user started. When the reply does not answer your request, say so.
- **Session name clash.** When a tmux session with the name exists with
  another root folder, `Agent` still adds the window there, and its result
  has a note. Relay the note.
- **Worktree errors.** A failed `git fetch` or `git worktree add` fails the
  call with the git output. Relay it. Do not remove the path or the branch
  to try again. Ask the user.
- **State.** Each agent keeps its state in
  `~/.local/state/pi-tmux-agents/<id>/`. Do not edit it.
