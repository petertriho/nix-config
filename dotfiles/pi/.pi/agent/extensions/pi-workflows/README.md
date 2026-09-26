# Pi workflows

`pi-workflows` owns workflow discovery, commands, model assignments, persisted
runs, repository write policies, and browser review gates.
`pi-tmux-subagents` supplies the execution provider. It owns panes, child
sessions, sidecars, context estimates, and child watchers.

The extensions communicate through the versioned `pi.events` contract in
`../workflow-provider/`. The coordinator does not import the tmux extension.
The shared directory has no extension entry point.

## Installation

The Home Manager Pi module links these directories under
`~/.pi/agent/extensions/`:

- `pi-workflows/`
- `pi-tmux-subagents/`
- `workflow-provider/` (shared modules, not an extension)

Agent profiles remain in `pi-tmux-subagents/agents/`. Global and trusted
project profiles keep their existing precedence.

Both extension load orders work. A bounded startup handshake discovers
compatible providers after session initialization. Without a compatible
provider, the coordinator registers no workflow commands, aliases, or tools.
The coordinator reports the missing provider through the session UI.

Ordinary `subagent` tools and pi-tasks RPC remain independent of workflows.

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
a different provider. Historical snapshots without a provider ID use
`pi-tmux-subagents`. Provider loss never triggers automatic migration or retry.

## Saved state and presets

The session entry type remains `pi-tmux-subagents.workflow-run`. Historical
snapshots retain their embedded definitions, private skill text, gate history,
and role-session history. Existing sidecar formats and paths remain valid.

New preset writes use `state/pi-workflows/workflow-presets` under the Pi agent
directory. Reads also support `state/pi-tmux-subagents/workflow-presets`:

- A valid new file takes precedence. Different legacy content produces a warning.
- An invalid new file fails without legacy fallback.
- An absent new file permits migration from a valid legacy file.
- Migration never overwrites a concurrently created destination.
- Legacy files remain intact. Read, write, and collision errors remain visible.

This namespace migration does not convert obsolete fixed-role presets or
rename old workflow IDs.

## Interruption and safety

Role results carry correlated session, run, role, and launch identities.
Stale results cannot change the active run. The coordinator evaluates changed
files against the role policy and preserves all repository changes.

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
