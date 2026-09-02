# Workflow subsystem modules

This directory holds the generic workflow runtime pieces for
`pi-tmux-subagents`, with each module's tests beside it as `*.test.ts`.

`synthetic-docs-review.test.ts` is the generality proof: it authors a
temporary, never-bundled `docs-review` package (roles `author`/`verifier`, data
`draft`/`report`/`ticket`, command `docs`) inside temp directories and runs the
whole lifecycle — discovery, alias generation, startup model order, spawn,
resume, role-session replacement, persistence, write boundaries, rollover
handoff, recovery, completion, and reload restoration — without any TypeScript
branch for those IDs. `pter-workflow.test.ts` covers the bundled Pter package
against the same generic modules.

Version 1 starts with the manifest contract:

- `types.ts` defines the normalized workflow types shared by later registry,
  startup, state, and runtime modules, including parent-session run snapshots.
- `schema.ts` loads `workflow.json`, validates semantic rules that plain JSON
  schema cannot express, validates the private `SKILL.md` frontmatter, and
  resolves role write capabilities from current workflow data.
- `write-policy.ts` resolves manifest role capabilities into repository
  boundary rules, protects declared workflow files from broad `worktree`
  access, and reports violations without changing repository state.
- `state.ts` persists one active workflow run as versioned parent-session
  custom entries, restores the latest branch snapshot after reload, and marks
  in-flight launches as interrupted instead of pretending live tmux watchers
  survived.
- `runtime.ts` exposes the parent-session lifecycle commands, validates every
  manifest agent before startup selection, registers collision-free generated
  aliases, and expands the selected package's private skill into the startup
  message.

Parent-session commands:

- `/workflows` lists final discovered workflows, their source/package, alias
  availability, required-agent availability, and package diagnostics.
- `/workflow list` is the same listing.
- `/workflow run <workflow-id> <request>` starts a generic workflow by ID.
- `/workflow status` reports the persisted run, role assignments, data, role
  session history, and interrupted-launch warning.
- `/workflow abort` persists an aborted terminal snapshot.
- `/workflow-resume [request]` reinjects the active run's persisted definition
  and session/data state without rediscovery or reselection.
- Each collision-free manifest `command.name` is registered as a direct alias
  with the manifest description and argument hint. Reloads do not duplicate
  an alias already registered in the same extension session.
- The bundled Pter workflow is authored entirely in
  `../workflows/pter/workflow.json` and `../workflows/pter/SKILL.md`; `/pter`
  is its generated alias, not a hard-coded command.

Starting a new workflow while another run is active always requires explicit
replacement confirmation. Missing required agents fail before model selection
and before any run snapshot is persisted.

Key rules in v1:

- workflow packages are `workflow.json` plus a private `SKILL.md`;
- the manifest is strict and versioned;
- role order is preserved exactly as declared;
- normalized definitions are deep-frozen before they leave the loader;
- file write capabilities require either an exact current value or a safe
  repository-relative file constraint.
