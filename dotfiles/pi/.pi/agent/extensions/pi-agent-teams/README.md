# Pi agents and teams

`Agent` runs ordinary Pi or Claude CLI agents. `SendMessage` follows up with
finished ordinary agents. `ListAgents` lists agents, and `AgentInterrupt`
interrupts a running turn. `/subagent`, `/subtask`, and `/agent-models` remain
available. Workflow roles use the separate `workflow_*` tools.

Teams are available without an environment flag in an attached, interactive
tmux session. Eligible named native Pi agents join automatically.
Headless, unnamed, forked, isolated, and Claude CLI runs stay ordinary.

## Task configuration

The Home Manager Pi module links `tasks-config.json` from this repository.
The file sets `autoClearCompleted` to `"never"`. Activate the Home Manager
change and restart Pi before you accept a live team. A running `pi-tasks`
extension does not reload its private configuration only because the disk
file changed. Each child needs its own startup or reload receipt.

The team adapter checks the derived task path, disk configuration, session
identity, and task-file fingerprint. It pins each child to the derived path.
These checks do **not** prove which file or mode an already running
`pi-tasks` instance uses. A stale private configuration or a different active
store can pass the disk checks. An empty native task list cannot establish
store identity. A change that another writer restores between checks also
remains undetected.

The adapter asks the actual user to approve sensitive teammate calls.
Approved `TaskCreate` and `TaskUpdate` calls use the installed task-file lock.
Supported adapter vetoes run before that write. Native lead calls, `/tasks`,
hooks, and independent processes bypass this pre-commit approval and veto.
The adapter detects some bypasses later through file fingerprints. After a
valid native lead change, it checks the new task file and invalidates pending
approvals. The next teammate write needs fresh approval for the new baseline.
An unsafe file or an uncertain commit still pauses team writes. The adapter
cannot undo a native write or detect every intervening write. Keep other Pi
processes from changing the team task file.
After an uncertain commit, inspect the task list and start a fresh lead session.
The adapter does not silently reset a paused roster.

For a full teammate stop, use native `TaskStop` with
`task_id: "team:<member UUID>"`. `AgentInterrupt` stops only the current turn.

## Tests

From `dotfiles/pi/.pi/agent/extensions/`, run:

```sh
npm run typecheck
npm test
npm run test:tmux-smoke
```

The tmux smoke test needs a real attached tmux pane. It uses a temporary Pi
agent directory, an offline mock provider, and the installed `pi-tasks`.
`npm run test:claude-smoke` needs a runnable Claude CLI and attached tmux.
Neither smoke test edits the user's task file.
