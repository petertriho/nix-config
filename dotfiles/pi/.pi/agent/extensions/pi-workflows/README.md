# Pi workflows

`pi-workflows` owns workflow discovery, commands, model assignments, persisted
runs, and browser review gates.
`pi-agent-teams` supplies the execution provider. It owns panes, child
sessions, sidecars, context estimates, and child watchers.

The extensions communicate through the versioned `pi.events` contract in
`../workflow-provider/`. The coordinator does not import the tmux extension.
The shared directory has no extension entry point.

## Installation

The Home Manager Pi module links these directories under
`~/.pi/agent/extensions/`:

- `pi-workflows/`
- `pi-agent-teams/`
- `workflow-provider/` (shared modules, not an extension)

Agent profiles remain in `pi-agent-teams/agents/`. Global and trusted
project profiles keep their existing precedence.

Both extension load orders work. A bounded startup handshake discovers
compatible providers after session initialization. Without a compatible
provider, the coordinator registers no workflow commands, aliases, or tools.
The coordinator reports the missing provider through the session UI.

Ordinary `Agent` calls and pi-tasks RPC remain independent of workflows.
`SendMessage`, `ListAgents`, and `AgentInterrupt` handle ordinary agent coordination.
The old callable subagent tools are not registered.

## Commands and provider selection

- `/workflow list` and `/workflows` list discovered packages.
- `/workflow run <id> <request>` starts a workflow.
- `/workflow status` shows the active persisted run.
- `/workflow abort` stops the owned role and aborts the run.
- `/workflow-resume [request]` restores orchestration from the saved definition.
- `/peter <request>` is the generated alias for the bundled Peter package.

A new run automatically selects its provider only when exactly one provider
qualifies. With multiple providers, the user selects one before model setup.
Cancellation or missing interactive UI preserves the current run.

Each run retains its provider ID. The coordinator rejects execution through
a different provider. Snapshots without a provider ID use `pi-agent-teams`.
Provider loss never triggers automatic migration or retry.

## Saved state and presets

The session entry type is `pi-agent-teams.workflow-run`. Snapshots under that
type retain their embedded definitions, private skill text, gate history,
and role-session history.

Preset reads and writes use `state/pi-workflows/workflow-presets` under the Pi
agent directory. No preset migration runs during the extension rename.

## Interruption and safety

Role results carry correlated session, run, role, and launch identities.
Stale results cannot change the active run. Workflow roles receive instructions
about their artifact targets; the coordinator does not enforce write boundaries.

Tree navigation stops the owned role before it changes branches. A failed
stop cancels navigation. Abort, replacement, and completion also require a
successful stop. Provider loss or reload interrupts execution instead of
silently continuing it. An interrupted run requires explicit recovery.

Browser gates remain parent-only. A pending gate cannot overlap a role.
An owned child with uncertain cleanup also blocks a gate. Child sessions
retain `PI_DENY_TOOLS` and `spawning: false` restrictions.

## Development

From the extensions directory, run:

```sh
npm run typecheck
npm test
```

Tests live in each extension's `__tests__/` directory. The workflow module
tests live in `pi-workflows/__tests__/workflow/`; integration tests run with
the same Node test command. These directories remain inside installed,
directory-symlinked extensions.

`pi-workflows/__tests__/installed-loader.test.ts` uses Pi's real resource
loader and installed symlinks when available. It covers both load orders,
fresh runs, historical resume, and the missing-provider case. Its model
uses an in-memory stream.
The tmux integration tests exercise the real execution adapter.

See [runtime modules](workflow/README.md), [discovery roots](workflow/registry.md),
and [workflow authoring](workflows/README.md) for the manifest and runtime details.
