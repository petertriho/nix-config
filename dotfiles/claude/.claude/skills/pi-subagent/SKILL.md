---
name: pi-subagent
description: "Delegate a task to a pi coding agent that runs in a split tmux pane beside Claude, relay pi's final answer, and continue the same pi session with follow-ups. Use only when the user explicitly asks to delegate work to pi, to run a pi subagent, or to use a model served through pi. Do not use for ordinary subagent work, for Claude teammates, or for tasks the user did not ask to send to pi."
argument-hint: "[--model <provider/id[:thinking]>] [--thinking <level>] <task>"
allowed-tools: Bash(pi-subagent *)
---

# pi-subagent

Run pi as an interactive subagent. `pi-subagent spawn` opens a tmux pane
beside this Claude pane and starts pi on a persistent pi session. The user can
watch the pane and type into it. `pi-subagent wait` returns pi's final
assistant text when pi ends its turn. `pi-subagent send` continues the same
session. The script needs tmux: outside tmux, `spawn` and `send` exit 2 and
say why.

## Command reference

| Command | Effect | Output |
| ------- | ------ | ------ |
| `pi-subagent spawn [--name <label>] [--model <provider/id[:thinking]>] [--thinking <level>] [--cwd <dir>] <task\|-> [-- <pi args>...]` | Opens a pane and starts pi with the task. Task `-` reads stdin. Arguments after `--` go to pi verbatim. | The subagent id on stdout. |
| `pi-subagent wait <id> [--timeout <seconds>]` | Blocks until pi ends its next turn. No timeout by default. | pi's final text on stdout. On stderr: `pi-subagent: id=<id> pane=<pane> turn=<seq> stop=<stopReason>`, plus `error=<message>` when pi reports one. |
| `pi-subagent send <id> <message\|->` | Pastes the message into a pane that still runs pi and presses Enter. A stopped pane, a dead pane, and a pane whose pi already exited are reopened on the same session with the same cwd, model, thinking, and pi args. Then behaves like `wait`. Message `-` reads stdin. | Same as `wait`. |
| `pi-subagent stop <id>` | Closes the pane and marks the subagent stopped. The pi session stays. | Nothing on stdout. |
| `pi-subagent list` | Lists every subagent. | Id, name, pane, status (`alive`, `dead`, `stopped`), and last consumed turn. |
| `pi-subagent session <id> [--path] [--last <n>]` | Reads the pi session file of a subagent. It only reads. | The condensed transcript on stdout: one block per message with the role, the tool name, the stop reason, the text, and one line per tool call. Text longer than 400 characters is clipped. `--path` prints only the path of the session file. `--last <n>` prints only the last n messages. |

Exit codes of `wait` and `send`:

- `0`: the turn ended with stop reason `stop`.
- `1`: any other stop reason (`error`, `aborted`, `length`, `toolUse`,
  `deferred`, or unknown). The trailer names it.
- `2`: pi or its pane exited without a new turn. stdout has the last lines
  of the pane when the pane still exists.
- `124`: `--timeout` expired. The pane still runs.

Other exit codes: `2` for a preflight failure (not in tmux, or `pi`, `tmux`,
`jq`, or the extension file missing), `2` when `session` finds no session
file for the id, and `64` for a usage error or an unknown id.

## Procedure

1. Build a self-contained task prompt. pi does not see this conversation:
   include the goal, the relevant paths, the constraints, and the expected
   final message.
2. Spawn in the foreground (it returns in about a second) and store the id it
   prints. Use the quoted heredoc stdin form for every multi-line prompt and
   for any text with backticks or quotes. Bash does no substitution inside a
   quoted heredoc:

   ```
   pi-subagent spawn --name <label> [--model <provider/id[:thinking]>] [--thinking <level>] - <<'EOF'
   <task prompt>
   EOF
   ```

   A short single-line task without backticks or quotes may be an argument:
   `pi-subagent spawn --name <label> "<task>"`. `allowed-tools:
   Bash(pi-subagent *)` covers the heredoc form, because the command starts
   with `pi-subagent`.
3. Pass `--model` and `--thinking` only when the user named them. Otherwise
   pi's own defaults apply.
4. Run `pi-subagent wait <id>` through Bash with `run_in_background: true`.
   End the turn or continue other work. Never poll or sleep, and do not read
   the state files.
5. When the exit notification arrives, relay pi's output to the user. When the
   exit code is not 0, also give the exit code and the trailer.
6. Continue the same session in the background with the same heredoc rule:

   ```
   pi-subagent send <id> - <<'EOF'
   <message>
   EOF
   ```

   Run it with `run_in_background: true` and relay the result as in step 5.
7. When tasks are independent, spawn several subagents in parallel and run
   one background `wait` per id.
8. Leave panes open unless the user asks to stop them. Stop one with
   `pi-subagent stop <id>`. `pi-subagent list` shows every id.
9. Do not set `--timeout` for implementation tasks. Use it only for short
   checks. When speed matters, pass `-- --no-lens` at the end of `spawn` to
   skip the pi-lens analyzers.
10. Read the transcript only when the final message is not enough: a failed
    or incomplete run, a result that contradicts the task, or a user question
    about what pi did. Run `pi-subagent session <id> --last 20` for the
    recent messages, or `pi-subagent session <id>` for the whole run. For the
    unclipped text, run `pi-subagent session <id> --path` and read that JSONL
    file with your own tools. Never relay the transcript in full: report what
    the user asked about. `session` only reads, so it is safe while pi works.
    pi appends each message as it completes, so the answer it is writing now
    is not in the file yet.

## Edge cases

- **Pane died (exit 2).** pi or its pane exited before it ended a turn. Relay
  the captured pane lines and do not retry silently. Ask the user before a
  new spawn. Known trigger: `pi-subagent spawn --model no/such-model "x"`.
  pi prints `Error: Model "no/such-model" not found.` and exits 1, and
  `wait` exits 2 with that screen. A pi that fails this early writes no
  session file, so `pi-subagent session <id>` also exits 2. When pi did run,
  that command shows what it did before it stopped. The next `send` reopens
  the session in a new pane by itself; no `stop` is needed first.
- **Stop reason other than `stop` (exit 1).** The trailer names the stop
  reason and the error message. Relay both. Do not present the text as a
  finished result.
- **Timeout (exit 124).** pi is still working. Run `wait` again in the
  background, or stop the subagent when the user asks.
- **The user typed into the pane.** The next `wait` can return a turn that the
  user started, not Claude. When the text does not answer your request, say
  so in the relay. `send` always waits for a turn newer than every recorded
  turn.
- **Task that starts with `@`.** pi reads `@path` as a file include, also
  after `--`. Rephrase the task or add a prefix, for example `Task: @...`.
- **Paste swallowed.** A dialog or picker in the pi pane can swallow a pasted
  message, and `send` then does not return. Recover with `pi-subagent stop
  <id>` and then `pi-subagent send <id> ...`, which reopens the session in a
  new pane.
