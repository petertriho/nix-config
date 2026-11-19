---
name: tmux-worker
description: "Start Claude Code workers in tmux windows and get their replies back: start a worker in a worktree or folder, wait for its turn to end, send follow-ups, read its screen, interrupt, stop, and resume it. Use only when the user names tmux for workers or agents, such as \"tmux workers\", \"orchestrate this in tmux\", \"start a claude in tmux for each repo\", or \"send this to the tmux worker\". Do not use for Orca (orchestration, orca-cli), Paseo (paseo), or pi (pi-subagent), and do not use for ordinary subagent or parallel work, which uses built-in subagents."
allowed-tools: Bash(tmux-worker *)
---

# tmux-worker

Run Claude Code workers in tmux and act as their lead. `tmux-worker spawn`
opens a detached window in a tmux session, and starts claude there with your
prompt. The user can watch the window and type into it. `tmux-worker wait`
returns the final reply of the worker when its turn ends. `tmux-worker send`
continues the same worker. A worker never takes the focus of the user's tmux
client.

The `tmux-workers` plugin shows the workers of this session above the prompt
and in a sidebar (`/tmux-workers`). A click opens a worker window.

## Preflight

1. Check that `TMUX` is set. Outside tmux, tell the user and stop.
2. Check that `TMUX_WORKER_ID` is not set. A worker cannot start workers.

## Command reference

| Command | Effect | Output |
| ------- | ------ | ------ |
| `spawn [--name <label>] [--cwd <dir>] [--session <name>] [--session-dir <dir>] [--window <name>] [--model <model>] [--permission-mode <mode>] [--claude-arg <arg>]... <prompt\|->` | Creates the session when it is missing (detached, rooted at `--session-dir`, which defaults to `--cwd`). Adds a detached window in `--cwd` (default: the current folder) and starts claude with the prompt. Prompt `-` reads stdin. Without `--session`, the window opens in your own session. The permission mode defaults to `auto`. Each `--claude-arg` passes one more argument to claude, and a resume passes it again. | The worker id on stdout. On stderr: `tmux-worker: id=<id> target=<session>:<window> pane=<pane> cwd=<dir>`. |
| `wait <worker> [--timeout <seconds>]` | Blocks until the worker ends a turn, waits on a dialog, or is interrupted. No timeout by default. | The final reply on stdout. On stderr: `tmux-worker: id=... target=... pane=... turn=<n> event=<event>`. |
| `send <worker> <message\|->` | Pastes the message into the worker and presses Enter, then behaves like `wait`. A stopped worker, a closed window, and an exited claude are reopened with `claude --resume` on the same conversation. | Same as `wait`. |
| `read <worker> [--lines <n>]` | Prints the last lines of the worker screen (default 60). It only reads. | The screen text. |
| `interrupt <worker>` | Stops the running turn of the worker (Ctrl+C), or cancels its open dialog (Escape). When no turn runs, it does nothing and writes a note. | Nothing. |
| `stop <worker>` | Closes the worker window. The folder, the branch, the session, and the conversation stay. | Nothing. |
| `list [--json] [--lead <session-id>]` | Lists every worker with its status: `working`, `waiting`, `idle`, `error`, `stopped`, or `dead`. `--lead` keeps only the workers that one lead session started. | One row per worker, or a JSON array. |

`<worker>` is the id, or a name that only one worker has.

Exit codes of `wait` and `send`:

- `0`: the turn ended.
- `1`: the turn ended with an API error, or `interrupt` stopped it. The
  trailer names the event.
- `2`: claude or its window is gone, or the worker is stopped. When the
  window exists, stdout has its last lines.
- `3`: the worker waits on a permission prompt or a question. stdout has the
  message and the screen. `send` also exits 3 without sending, because the
  text would answer the dialog.
- `124`: `--timeout` expired. The worker still runs.

Other exit codes: `2` when no tmux server answers, `64` for a usage error, an
unknown worker, or a call from inside a worker.

## Procedure

1. Prepare a folder for each worker with the rules of the project. Do not let
   two workers edit one folder at the same time.
   - In `~/Work`, follow `~/Work/CLAUDE.md`: create the worktree in
     `~/Work/<repo>/worktrees/<dir>`, then pass
     `--cwd <worktree> --session <repo> --session-dir ~/Work/<repo>`.
2. Write a self-contained prompt for each worker with the template below. The
   worker cannot see this conversation.
3. Start each worker. Store each id, and tell the user each target
   (`session:window`).
   - In normal mode, use a quoted heredoc. Bash does no substitution inside
     it:

     ```sh
     tmux-worker spawn --cwd <dir> --session <name> --session-dir <dir> --name <label> - <<'EOF'
     <prompt>
     EOF
     ```

   - In code mode, pass the prompt as an argument. `$` quotes each value as
     one argument:

     ```js
     const id = (await $`tmux-worker spawn --cwd ${dir} --session ${session} --session-dir ${root} --name ${label} ${prompt}`.text()).trim()
     ```

   - For frontend work, such as a change to a web UI or a check of a page in
     the browser, add `--claude-arg --chrome`. The worker then has the Claude
     in Chrome tools. It runs without code mode, because Claude in Chrome does
     not work in code mode.

4. Wait for each worker in the background. Never poll, sleep, or read the
   state files.
   - In normal mode, run `tmux-worker wait <id>` through Bash with
     `run_in_background: true`.
   - In code mode, the REPL refuses `run_in_background`. Run
     `$('tmux-worker wait <id>', 1000)` and ignore its result. The command
     moves to the background after 1 second. When it ends, a task
     notification gives the exit code and an output file with the reply and
     the trailer. Read that file.
5. When a wait ends, relay the reply to the user. When the exit code is not
   0, also give the exit code and the trailer. Review the work in the folder
   of the worker. Do not trust the report alone.
   - A turn end is not completion. A reply can end with an error, ask a
     question, report a blocker, or leave the task unfinished. When the
     instructions of the user cover the next step, continue the worker with
     `send`. Otherwise, ask the user.
   - When your review finds a problem, send the problem and its evidence to
     the worker. When the same problem remains after two follow-ups, report
     it to the user. Do not send a third follow-up for it.
6. Continue a worker with `send`, in the background in the same way. A
   message to a worker that is still working joins its current turn, and the
   reply is the end of that turn.
7. To check progress, run `tmux-worker read <id>`. To stop a turn, run
   `tmux-worker interrupt <id>`. A wait that runs then ends with exit 1.
8. Stop a worker that will be idle for a long time. An open worker keeps
   claude and its MCP servers in memory, several hundred MB for each worker.
   `stop` closes the window. The folder, the branch, and the conversation
   stay. Decide by yourself, and tell the user each worker that you stop.
   - Stop a worker when you reviewed its work and it has no next step, or
     when it will wait for more than about one hour, for example on a PR
     review or on another worker.
   - Keep a worker open while you send it follow-ups. A resume can miss the
     prompt cache, so a stop between quick turns costs more than it saves.
   - Keep a worker open while it runs a server, a background shell, or a
     monitor. `stop` ends these processes.
   - Keep a worker open while it waits on a dialog, while the user types
     into its window, or when the user asked to keep it open.
   - When a worker that you stopped has a next step, continue it with
     `send`. `send` reopens it with `claude --resume` on the same
     conversation. `wait` on a stopped worker exits 2.
   - Before you resume a worker that the user stopped, ask the user.
   - Never remove a worktree or delete a branch unless the user asks.
9. When tasks are independent, start several workers, and run one background
   wait for each.
10. Your task is done when each worker finished its task and you reviewed its
    work. A worker that the user stopped or took over also counts as done.
    Until then, do not report the whole task as done. When the user asked
    only to start workers, the task is done when they run. Before you
    report, stop each worker that has no next step (step 8).

## Worker prompt template

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
- <commit, push, and PR rules: what the worker may do itself>

## Report
When you finish, reply with: the commit SHAs, the PR URL if any, each check
that you ran with its result, each acceptance check that you could not run
and why, and each deviation from the plan.
```

Keep the rules that the user gave for the work. Say what the worker may not
do, such as push or open a PR, when the user did not allow it.

## Edge cases

- **Waiting (exit 3).** Only the user can answer the dialog. Tell the user the
  target and the question from stdout. When the user says that they answered,
  run `wait` again. To cancel the dialog instead, run `interrupt`.
- **Gone (exit 2).** When you did not stop the worker yourself, relay the
  screen lines. Do not resume it by yourself. Ask the user first. The next
  `send` reopens the worker on the same conversation.
- **The user typed into the window.** The next `wait` can return a turn that
  the user started. When the reply does not answer your request, say so.
- **Session name clash.** When a session with the name exists with another
  root folder, `spawn` still adds the window there and prints a note on
  stderr. Relay the note.
- **Folder trust.** In a folder that Claude Code does not trust yet, claude
  asks before the first turn, and no hook runs. `wait` and `send` exit 3, and
  the trailer says `event=trust`. Only the user can answer. A folder below a
  trusted folder, such as a worktree of a trusted repository, does not ask.
- **Permission mode.** Workers use `auto`. Pass `--permission-mode` only when
  the user asks for another mode.
- **State.** Each worker keeps its state in
  `~/.local/state/tmux-worker/<id>/`. Do not edit it.
