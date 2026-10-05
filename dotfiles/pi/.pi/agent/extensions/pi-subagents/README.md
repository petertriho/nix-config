# Pi subagents

The `pi-subagents` extension provides subagents, native teams, and workflows for Pi.

`Agent` runs ordinary Pi or Claude CLI agents. `SendMessage` follows up with
finished ordinary agents. `ListAgents` lists agents, and `AgentInterrupt`
interrupts a running turn. `/subagent`, `/subtask`, and `/agent-models` remain
available. Workflow roles use the separate `workflow_*` tools.

Teams are available without an environment flag in an attached, interactive
tmux session. Eligible named native Pi agents join automatically.
Headless, unnamed, forked, isolated, and Claude CLI runs stay ordinary.

`model: "inherit"` is an alias for `model: "parent"`. Both use the parent
session's active model and thinking level instead of the agent's defaults.
Only `isolation: "worktree"` creates a separate git worktree. Every other
isolation value, including `"shared"`, uses the shared working directory.
Shared runs keep the normal team-admission checks.

## Installation

Home Manager installs this extension through the
`~/.pi/agent/extensions/pi-subagents/` directory symlink.
Pi loads `pi-subagents/index.ts` as the single entry point for subagents and workflows.
Workflow modules share the plugin's responsibility folders.
Bundled workflows live in `pi-subagents/workflows/`, relative to the extensions directory.
See the [workflow runtime](workflow/README.md) and
[workflow authoring contract](workflows/README.md) for details.

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

Teammate `TaskCreate` and `TaskUpdate` mutations support only direct model-issued calls.
Nested calls through codemode or `ctx.executeTool()` fail before approval or mutation.
Direct calls retain actual-user approval and pre-commit vetoes.

For a full teammate stop, use `TeamStop` with
`task_id: "team:<member UUID>"` from the owning lead session. It is a direct
tool and is callable through `ctx.executeTool()`. Refused or cancelled stops
return `isError: true`. Members cannot use this tool.
`AgentInterrupt` stops only the current turn.

Qualified `TaskStop` calls fail before stopping anyone and direct callers to
`TeamStop`. Native `TaskStop` behavior stays unchanged. A bare member UUID
still falls back to a team stop only after the exact native “No running
background process” error. Prefer `TeamStop` for an unambiguous team stop.
`Agent` and `SendMessage` are model-only because they can launch agents or
require UI orchestration; they are not callable through `ctx.executeTool()`.
`ListAgents` returns structured `{ agents: [...] }` output to codemode scripts.
Its direct calls retain the readable agent list.

## Compatibility

`pi-subagents` replaces the `pi-agent-teams` extension directory. Tools and
commands keep their existing names. Home Manager links the new directory after
activation.

The workflow provider ID remains `pi-agent-teams`. The saved session entry type
remains `pi-agent-teams.workflow-run`. These IDs preserve existing workflow runs.
Workflow presets remain in `state/pi-workflows/workflow-presets` under the Pi
agent directory.
Global reload keys also remain unchanged so the new module can clean up resources
from the previous module.

## Module layout

The root `index.ts` initializes the execution adapter and creates the workflow coordinator.
`registration/lifecycle.ts` registers its session hooks after the adapter and team handlers.
`runtime/workflow-coordinator.ts` owns coordination state without an extension entry point.
The coordinator and execution adapters communicate through `pi.events`.
Implementation modules use these responsibility folders:

| Folder | Responsibility |
| --- | --- |
| `profiles/` | Agent discovery, frontmatter, launch policy, model selection, and configured models |
| `execution/` | Launch, watch, resume, launch-profile sidecars, provider failures, results, and shared execution types |
| `sessions/` | Session reading, seeding, restoration, saved-context estimates, and context-fit decisions |
| `telemetry/` | Activity sidecars, status classification, and usage summaries |
| `presentation/` | Terminal formatting, widgets, and tool renderers |
| `adapters/` | Tmux surfaces, workflow execution adapter, event contract, and workflow transport client |
| `tasks/` | Task profiles, model resolution, run state, RPC, and disk policy |
| `teams/` | Admission, approvals, coordination, locks, and transport |
| `child/` | Completion and teammate extensions loaded explicitly in child sessions |
| `registration/` | Tool schemas, tools, commands, and extension registration |
| `runtime/` | Shared runtime state, refresh, interrupts, workflow coordination, and provider discovery |
| `workflow/` | Workflow definitions, registry, state, handoffs, presets, commands, role tools, and review gates |
| `workflows/` | Bundled workflow packages |

Root compatibility files preserve child launch paths and existing service and
provider imports. Internal modules import the responsibility folders directly.
`launch-profile.ts` and `model-picker.ts` preserve existing imports through direct re-exports
from `execution/launch-profile.ts` and `profiles/model-picker.ts`.
Workflow tools and ordinary agents share `execution/types.ts` and `execution/results.ts`.
The coordinator imports the event contract, not the execution adapter.

Configuration, bundled `agents/`, and the Claude `plugin/` remain at the extension
root. Their paths do not depend on an implementation module's location.

## Tests

From `dotfiles/pi/.pi/agent/extensions/`, run:

```sh
npm run typecheck
npm test
npm run test:tmux-smoke
```

All plugin tests share `__tests__/`. Workflow tests use descriptive `workflow-*.test.ts` names.
Test helpers and fixtures live in `__tests__/helpers/` and `__tests__/fixtures/`.
Context-estimation cases share the context-fit suite. Compatibility-helper cases share the module-layout suite.
The recursive `pi-subagents/**/*.ts` include covers all internal TypeScript modules.

The tmux smoke test needs a real attached tmux pane. It uses a temporary Pi
agent directory, an offline mock provider, and the installed `pi-tasks`.
`npm run test:claude-smoke` needs a runnable Claude CLI and attached tmux.
Neither smoke test edits the user's task file.
