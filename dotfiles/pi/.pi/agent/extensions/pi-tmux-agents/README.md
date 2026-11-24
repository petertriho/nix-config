# pi-tmux-agents

`pi-tmux-agents` lets a pi session start pi agents in tmux windows and act as
their lead. The tools follow the Claude Code agent tools: `Agent` waits for
the reply of the agent (foreground), or returns at once and delivers the
result later as a follow-up message (background). The user can watch each
agent window and type into it. It is the pi port of the Claude Code
`tmux-worker` skill, and it does not change `tmux-worker`.

Do not enable `pi-subagents` with this extension. Both register a tool named
`Agent`.

Home Manager links this directory into the global pi extension directory, so
every pi session loads it. The implementation targets pi `1.6.0` on Node
`24.x`. It has no runtime npm dependencies.

## Parts

| Part | Path | Job |
| ---- | ---- | --- |
| CLI | `dotfiles/scripts/.local/bin/pi-tmux-agents` | Opens the windows, starts pi, writes the inbox, and reads the turn events. bash, tmux, and jq. |
| Extension | `index.ts` | Picks agent mode, lead mode, or no mode from the environment. |
| Agent mode | `agent.ts` | Records the turn events of an agent pi, and delivers the inbox requests to it. |
| Lead mode | `lead.ts`, `tools.ts`, `cli.ts` | Six tools, the panel, the result messages, and the poll. |
| Agent types | `agent-types.ts`, `agents/*.md` | The bundled types and the discovery of the project types. |
| Presentation | `presentation/` | The panel, the result card, and the tool rows. |
| Skill | `skills/pi-tmux-agents/SKILL.md` | The lead procedure. Lead mode adds the folder through `resources_discover`. |

`presentation/ui.ts` is a copy of `pi-subagents/presentation/ui.ts`, so the
panel and the cards look like those of `pi-subagents`. Its header comment
names the source. A change to the source does not reach the copy.

## Modes

`index.ts` reads the environment once, when pi loads the extension:

| Environment | Mode |
| ----------- | ---- |
| `PI_TMUX_AGENT_ID` and `PI_TMUX_AGENT_DIR` are set | Agent mode |
| `PI_TMUX_AGENT_ID`, `TMUX_WORKER_ID`, `PI_SUBAGENT_ID`, or `PI_SUBAGENT_SESSION` is set otherwise | No mode. A tmux worker or a pi subagent gets no tools. |
| None of these is set | Lead mode |

An empty variable counts as not set.

### Lead mode

- Tools: `Agent`, `SendMessage`, `ListAgents`, `AgentRead`,
  `AgentInterrupt`, and `AgentStop`. Each tool runs the CLI with a timeout of
  30 seconds. An `Agent` call with `isolation: "worktree"` has 300 seconds,
  because it can fetch first. A failed command gives a tool error with the
  stderr of the CLI.
- `Agent` resolves `subagent_type` (default `general-purpose`), writes the
  body of the type to a temporary file, and runs `spawn` with
  `--agent-type`, `--description`, `--system-prompt-file`, `--tools`, and
  `--auto-stop` from the type. The default name is a slug of the
  description, with `-2`, `-3` added when an agent of the session has the
  name.
- A foreground `Agent` call adds the id to the foreground set, then runs
  `wait <id>` with the signal of the tool call and no timeout. The poll
  passes `--skip <id>` for each id in the set, so it does not take the
  event. The exit code of `wait` gives the result: 0 the reply, 3 "needs
  input" (the agent then works as a background agent), 1 an error or
  interrupted result, 2 gone. On an abort (Esc), the call runs `interrupt`,
  then `wait --timeout 10` to take the `interrupted` event, so that no
  follow-up message starts a new lead turn.
- At `session_start`, lead mode finds the agent types again with the folder
  of the session, and registers `Agent` again when they changed. Project
  types in `<cwd>/.pi/agents/*.md` load only when `ctx.isProjectTrusted()`
  is true.
- The lead id is the pi session id. `spawn` records it in the agent, and
  `pull` and `list` read only the agents of that id. After `/new`,
  `/resume`, or `/fork`, the panel shows the agents of the new session. The
  results of the other agents stay in their state folders until their
  session is active again.
- The poll runs `pi-tmux-agents pull --lead <id> --json`, then `list`. It
  runs every second while the lead has a live agent, and every 10 seconds
  otherwise. It skips the CLI when no state file changed, but it runs at
  least every 10 seconds, because a pane that dies changes no file. A spawn,
  send, interrupt, or stop starts a poll at once.
- Each pulled record becomes one custom message of type
  `pi_tmux_agents_result`, sent with `deliverAs: "followUp"` and
  `triggerTurn: true`. The message text has a headline, the final text of
  the turn, and a trailer such as
  `pi-tmux-agents: id=<id> target=<target> pane=<pane> turn=<n> event=<event>`.
- A `waiting` record also shows a warning toast.
- The panel above the editor shows each agent that is not stopped, with its
  type and the time since its last status change.
- Without a UI (print and JSON mode), lead mode does not poll, because no
  result could start a turn. The tools still work.

### Agent types

A type is a Markdown file with a frontmatter of `key: value` lines:

| Key | Content |
| --- | ------- |
| `name` | The `subagent_type` value. Letters, digits, `.`, `_`, and `-`. Required. |
| `description` | One line for the `Agent` description. Required. |
| `tools` | A comma list for `pi --tools`. It also hides the extension tools. Empty means the pi defaults. |
| `model`, `thinking` | Defaults for the agent. The `Agent` parameters replace them. |
| `auto-stop` | `true` closes the window after each `stop` result. `SendMessage` reopens it. |

The body is appended to the system prompt with `pi --append-system-prompt`.
A file without a valid name or description is skipped. The bundled types are
`general-purpose`, `Explore`, and `Plan`. A project type replaces a bundled
type with the same name.

### Agent mode

- The extension appends one line to `turns.jsonl` for each event:
  - `working` when a run starts. It is not written twice in a row.
  - `waiting` when a dialog opens during a run, from `ui_prompt_start`.
    `working` follows when the dialog closes during the run. A dialog outside
    a run comes from a command that the user typed, and gives no event.
  - `stop`, `error`, or `interrupted` when the run settles. pi `1.6.0` has no
    `aborted` field in `agent_settled`, so an assistant stop reason of
    `aborted` gives `interrupted`.
- A 500 ms timer reads the inbox in name order:
  - A message goes in as a user message when pi is idle, and as a follow-up
    when pi is busy.
  - An abort calls `ctx.abort()` when pi is busy. The later messages wait
    until the aborted run settles, so that they start a new run.
  - A message waits while a dialog is open. An abort does not wait.
  - The first prompt waits for the first tick, because pi can drop a message
    that arrives before it is ready.
- At `session_start`, the extension writes `session.json` with the session id
  and the session file.
- No handler throws into pi. A failed write costs the lead one event, and the
  lead can still read the screen.

## State contract

Each agent has the folder `<state>/<id>/`. `<state>` is
`$PI_TMUX_AGENTS_STATE_DIR`, or `$XDG_STATE_HOME/pi-tmux-agents`, or
`~/.local/state/pi-tmux-agents`. Home Manager creates the default folder and
grants it in the nono profile of pi.

| File | Writer | Content |
| ---- | ------ | ------- |
| `meta.json` | CLI | `id`, `name`, `cwd`, `session`, `session_dir`, `window_base`, `window_name`, `window_id`, `pane`, `pi_session`, `lead_session`, `lead_pane`, `model`, `thinking`, `pi_args`, `agent_type`, `description`, `tools`, `auto_stop`, `worktree`, `branch`, `base`, `consumed`, `launch_count`, `launch_seq`, `launched_at`, `gone_reported`, `stopped`, and `created`. |
| `system-prompt.md` | CLI | A copy of `--system-prompt-file`. Each launch passes it again with `--append-system-prompt`, as it passes `--tools`. |
| `turns.jsonl` | Agent mode | One JSON line for each event: `{seq, event, text, message, session_id, ts}`. This is the shape of the `tmux-worker` file `turn-signal.sh`. `seq` is the line number. |
| `inbox/` | CLI | One file for each request: `<20-digit epoch ns>-message.txt` or `<20-digit epoch ns>-abort`. The CLI writes a dot file, then renames it. Agent mode skips dot files and deletes each request that it handled. |
| `session.json` | Agent mode | `{session_id, session_file}`. The result card shows the session file. |
| `pi.exit` | `launch` | The exit status of pi. |

`launch_seq` is the last `seq` in `turns.jsonl` at the last launch. `list`
shows `starting` until a newer line exists. `consumed` is the last `seq` that
`pull` or `wait` reported. `gone_reported` is the `launch_count` of the last
`gone` record, so `gone` comes once for each launch.

The writers lock with `mkdir`. Agent mode appends under `.turns.lock`. The
CLI changes `meta.json` under `.meta.lock`, and writes a temp file that it
renames.

`gone` is a pseudo event. `pull` and `wait` report it when the pane is gone
or `pi.exit` exists without a newer event. It is never in `turns.jsonl`.

## Behavior to know

- `pull` reports only the newest event of each agent, as `tmux-worker` does.
  When two turns end between two polls, the lead gets only the second result.
- A shell `pi-tmux-agents wait` or `pull` takes the events away from the
  lead. The lead extension then never gets them.
- Auto-stop is in the CLI: after `pull` or `wait` reports a `stop` event of
  an agent with `auto_stop`, the CLI closes its window and marks it stopped.
  The record has `auto_stopped: true`, and `wait` adds a note.
- `spawn --isolation worktree` runs `git worktree add --no-track -b <branch>
  <path> <base>`. The default path is `<repository root>/.worktrees/<slug>`,
  and `/.worktrees/` is added to `info/exclude`. A `<remote>/<ref>` base is
  fetched first. An existing path is used only when it is a worktree of the
  same repository on the branch. The CLI never removes a worktree or a
  branch.
- A new tmux window gets the environment of the process that creates it. An
  agent therefore gets the environment of the lead pi, including `PATH`.
  `launch` unsets `PI_SESSION_ID`, `PI_SESSION_FILE`, `PI_PROVIDER`,
  `PI_MODEL`, `PI_REASONING_LEVEL`, `PI_SUBAGENT_ID`, and
  `PI_SUBAGENT_SESSION`, then sets `PI_TMUX_AGENT_ID` and
  `PI_TMUX_AGENT_DIR`.
- A message to a working agent joins its run as a follow-up, and one result
  comes for the combined run.
- `interrupt` writes an abort to the inbox. When the agent waits on a dialog,
  it also sends `Escape` after agent mode took the abort, and only when the
  last event is still `waiting`.
- `PI_TMUX_AGENTS_CLI` names another CLI for lead mode. The default is
  `pi-tmux-agents` on `PATH`.

## Tests

Run these commands in `dotfiles/pi/.pi/agent/extensions`:

```sh
node --test "pi-tmux-agents/__tests__/*.test.ts"
npm run typecheck
npm run test:pi-tmux-agents-smoke
```

- The unit tests cover the mode switch, agent mode, the agent types, the CLI
  parsers, the panel, the result cards, the tools, the foreground flow, and
  lead mode. One test runs the
  `tmux-worker` script `turn-signal.sh` to compare the line shape.
- The smoke runs the real CLI, the installed pi, and tmux. Run it in a tmux
  pane. It uses a temporary tmux session, a temporary state folder, and the
  offline provider `smoke/pi-tmux-agents-provider.ts`. It removes the
  `node_modules/.bin` entries from `PATH`, because an agent must run the
  installed pi and not the dev package. It covers spawn, one `stop` for each
  turn, send to an idle and to a working agent, interrupt, a dialog and a
  held message, stop and resume on the same pi session, `gone`, the exit
  codes of `wait`, the refusal of `spawn` inside an agent, an agent type
  with its appended prompt, tool allowlist, and auto-stop, `pull --skip`,
  and a worktree with its reuse and refusals.
