# tmux-workers

A Claude Code plugin that shows the tmux workers of the current session. The
`tmux-worker` script starts the workers. The `tmux-worker` skill tells Claude
how to use the script.

## What it shows

- **Band**: one row above the prompt. It shows only when the session has a
  worker that is not stopped.
  - `tmux` opens or closes the pane.
  - Each live worker has a chip with a mark and its name:
    - A spinner: the worker is working.
    - `?` in the warning color: the worker waits for input, for example a
      permission dialog.
    - `✓`: the worker is idle. Its last turn ended.
    - `✗` in the error color: the turn failed, or the window or Claude is gone.
  - `+N` counts the chips that do not fit.
- **Pane**: `/tmux-workers` or the `tmux` label opens or closes it.
  - The header shows the counts for each status.
  - Each worker has a block: name, status and age, tmux target, folder, and
    the first line of its last reply.
  - The order is waiting, working, error, dead, idle, then stopped (dim).
- Select a chip or a row to switch your tmux client to the pane of the
  worker. The plugin runs `tmux switch-client -t <pane id>`. If tmux cannot
  find the pane, a toast says so.
- A toast shows each time a worker starts to wait.

## How it gets the data

- The plugin runs `tmux-worker list --json --lead <session id>`.
  - It runs every 2 s while the session has a live worker, and every 10 s
    otherwise.
  - Every 0.5 s, the plugin reads the mtime of the state folder of
    `tmux-worker`. A new worker folder changes it, and the list runs at once.
- The plugin has no `tool.call` hook. Claude Code turns off code mode in a
  session that loads a plugin with such a hook.
- `tmux-worker spawn` records `CLAUDE_CODE_SESSION_ID` of the lead as
  `lead_session`. The plugin compares it with `$.session.id()`. If the session
  id changes, for example after `/clear`, the workers that the session started
  before do not show.
- In a worker session (`TMUX_WORKER_ID` is set), the plugin does nothing.
- When the list fails, the plugin writes one line to the debug log for each new
  error, hides the band, and shows the error in the pane.

## Files

| File | Purpose |
| --- | --- |
| `hooks/register.tsx` | Hooks: session start and end, the command, tool calls, the band, and the pane. The timer and the list. |
| `hooks/data.ts` | Parse the list, sort, find new waits, fit the chips. |
| `hooks/views.tsx` | The band and the pane. |
| `hooks/theme.ts` | Theme colors and text clipping. |
| `types/index.d.ts` | The state contract. |
| `tests/plugin.test.tsx` | Tests with a mock engine and a mock clock. |

## Install

Home Manager links this folder to `~/.claude/skills/tmux-workers` (see
`modules/home-manager/programs/claude-code.nix`). Claude Code loads plugins
from `~/.claude/skills/<name>`.

## Check

```sh
claude plugin validate ~/.nix-config/dotfiles/claude/.claude/plugins/tmux-workers
claude plugin test ~/.nix-config/dotfiles/claude/.claude/plugins/tmux-workers
```

The plugin API of Claude Code is early access. A new Claude Code release can
change it.
