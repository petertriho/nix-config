# Workflow subsystem modules

This directory holds the generic workflow runtime pieces for
`pi-tmux-subagents`, with each module's tests beside it as `*.test.ts`.

`synthetic-docs-review.test.ts` is the generality proof: it authors a
temporary, never-bundled `docs-review` package (roles `author`/`verifier`, data
`draft`/`report`/`ticket`, command `docs`) inside temp directories and runs the
whole lifecycle — discovery, alias generation, startup model order, spawn,
resume, role-session replacement, persistence, write boundaries, rollover
handoff, recovery, completion, and reload restoration — without any TypeScript
branch for those IDs. `peter-workflow.test.ts` covers the bundled Peter package
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
  in-flight launches and browser gates as interrupted instead of pretending
  live watchers survived.
- `runtime.ts` exposes the parent-session lifecycle commands, validates every
  required agent before startup selection and enabled optional agents after
  selection, registers collision-free generated
  aliases, and expands the selected package's private skill into the startup
  message.
- `plannotator.ts` implements the asynchronous parent-only `workflow_gate`
  transport. It validates declared file targets, persists gate history and
  unmodified feedback, and delivers one `workflow_gate_result` on completion.
  The private skill, not the transport, chooses the next phase.
- `gate-tools.ts` registers the parent-only tool and connects its process
  ownership to parent-session changes and durable workflow transitions.

Parent-session commands:

- `/workflows` lists final discovered workflows, their source/package, alias
  availability, required-agent availability, and package diagnostics.
- `/workflow list` is the same listing.
- `/workflow run <workflow-id> <request>` starts a generic workflow by ID.
- `/workflow status` reports the persisted run, role assignments (including
  skip), data, role session and gate history, and interruption warnings.
- `/workflow abort` persists an aborted terminal snapshot.
- `/workflow-resume [request]` reinjects the active run's persisted definition
  and session/data state without rediscovery or reselection.
- Each collision-free manifest `command.name` is registered as a direct alias
  with the manifest description and argument hint. Reloads do not duplicate
  an alias already registered in the same extension session.
- The bundled Peter workflow is authored entirely in
  `../workflows/peter/workflow.json` and `../workflows/peter/SKILL.md`; `/peter`
  is its generated alias, not a hard-coded command.

Starting a new workflow while another run is active always requires explicit
replacement confirmation. Missing required agents fail before model selection
and before any run snapshot is persisted.

## Peter: evaluation and browser gates

Peter has five roles in order: planner, evaluator, task-writer, executor,
reviewer. Its six work phases are Plan, Evaluate, Tasks, Execute, Review,
and the user-authorized Fix pass. Only the evaluator is optional.

Evaluation is enabled by default, including parent-model mode. Per-role
configuration or a saved preset may assign the evaluator `{ "skip": true }`.
This is not a provider/model value, cannot be mixed with one, and cannot be
assigned to a required role. Skip survives preset editing and run resume;
skipped roles cannot spawn, resume, or recover. A skipped optional agent is
not a startup dependency.

The evaluator writes only the exact `EVALUATION.md` beside `PLAN.md`, using
the shared `plan-evaluate` primary skill and read-only evaluation commands.
The planner may read evaluation only for findings named by the user's notes;
the task writer has no evaluation input. Declared evaluation files stay
protected from planner and executor writes. Missing output or `NOTHING
EVALUATED` requires retry-or-stop, never silent skipping or a stale verdict.

Gates 1–3 use Plannotator if available:

| Gate | Target | Annotated result | Approved result |
| --- | --- | --- | --- |
| Plan | Plan directory after evaluation; `PLAN.md` when skipped | Revise only user-requested points, re-evaluate when enabled, repeat gate | Write tasks; accepted evaluation findings go to Done |
| Tasks | `TASKS.md` | Revise tasks, repeat gate | Execute |
| Review | `REVIEW.md` | One fix pass; annotations override conflicting standard scope | One fix pass if scope is nonempty; otherwise finish |

Approval notes are forwarded verbatim as non-blocking guidance, not revision
requests. Review's standard scope is CRITICAL/HIGH plus independent verdict
blockers; ordinary MEDIUM/INFO and unverified acceptance alone are excluded.
Gate 4 always asks in chat: resume reviewer, fresh reviewer, or stop. Re-review
and another fix pass each require their own fresh user choice.

Browser failures and dismissal fall back to explicit chat approval. Result
files live in `.artifacts/<plan-name>-decisions/`, outside the reviewed folder.
Full feedback, including whitespace, is retained in history and the original
result file; role prompts put it inside delimiters rather than trimmed data
slots. For folder reviews, per-file sections under absolute paths are
authoritative; `Folder Feedback` duplicates the active file's notes.

Only one browser attempt may be pending; it cannot overlap a role launch.
Abort, replacement, reload, session change, and shutdown stop owned review
processes while preserving artifacts and result files. After resume, an
interrupted gate requires its chat fallback. No orphan process is reconnected
and no late decision is trusted. Completed history is context, not a request
to rerun an already-finished phase.

Tree navigation stops an active workflow role before switching branches.
Its artifacts, session files, and resume metadata remain available for an
explicit later resume. Old watchers cannot update or notify the new branch.
Unrelated ordinary subagents are not stopped. If stopping the workflow role
fails, navigation is cancelled rather than leaving that role running.

This is a clean rename: no bundled `/pter` alias and no old-preset migration.
Configure a new five-role Peter preset. Historical runs keep their saved
workflow definition and identity, including the old name and role set.

Key rules in v1:

- workflow packages are `workflow.json` plus a private `SKILL.md`;
- the manifest is strict and versioned;
- role order is preserved exactly as declared;
- `optional: true` permits a saved `{ "skip": true }` assignment; omitted
  optional flags preserve the required-role behavior of existing v1 packages;
- normalized definitions are deep-frozen before they leave the loader;
- file write capabilities require either an exact current value or a safe
  repository-relative file constraint.
