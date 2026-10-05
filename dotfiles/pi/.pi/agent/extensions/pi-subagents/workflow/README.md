# Workflow subsystem modules

This directory holds the workflow subsystem of the `pi-subagents` plugin.
Its tests share the plugin's `../__tests__/` tree and use `workflow-*.test.ts` names.

The plugin entry point creates `../runtime/workflow-coordinator.ts`.
`../registration/lifecycle.ts` registers its session hooks.
`../runtime/workflow-discovery.ts` discovers compatible execution adapters.
Their versioned `pi.events` contract lives in `../adapters/workflow-contract.ts`.
`../adapters/workflow-client.ts` handles correlated requests and role ownership.

Workflow tools share execution types and result formatting with ordinary agents.
Launch-profile sidecars and failure classification live in `../execution/`.
Model selection lives in `../profiles/`; saved-context estimates live in `../sessions/`.
Bundled packages live in `../workflows/`.

`workflow-synthetic-docs-review.test.ts` authors a temporary, never-bundled `docs-review` package.
Its roles are `author`/`verifier`, its data slots are `draft`/`report`/`ticket`, and its command is `docs`.
The test covers discovery, aliases, startup model order, the private skill, and the full role lifecycle.
That lifecycle includes spawn, resume, rollover, handoff, recovery, completion, persistence, and reload.
No production TypeScript branch names these package IDs.
`workflow-peter-workflow.test.ts` covers the bundled Peter package through the same generic modules.

The synthetic lifecycle uses `createWorkflowEventClient` and `attachTmuxWorkflowProvider`, not `deps.execution`.
`../__tests__/helpers/workflow-event-execution.ts` supplies an in-memory event bus and fake child execution services.
The provider reads real agent files and sidecars, confirms repository roots, and passes canonical models from the registry.
The fake service calls `beforeLaunch` and `onLaunched`, then writes both rollover links before the provider acknowledges replacement.
The test rejects either missing link and ignores revoked callbacks and uncorrelated results.
Recovery selects the model in the event tools and promotes the run assignment only after matching response evidence and a correlated completed result.

Version 1 starts with the manifest contract:

- `types.ts` defines the normalized workflow types shared by later registry,
  startup, state, and runtime modules, including parent-session run snapshots.
- `schema.ts` loads `workflow.json`, validates semantic rules that plain JSON
  schema cannot express, validates the private `SKILL.md` frontmatter, and
  validates workflow data supplied during role launches.
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

## Execution adapters and saved runs

The bounded startup handshake registers workflow commands, aliases, and tools only after a compatible execution adapter responds.
Without an adapter, workflow features stay disabled. Ordinary agents and task RPC remain independent.
Workflow lifecycle tools and `workflow_gate` use `model-only` exposure.
Child sessions retain their existing denied-tool and spawning restrictions.

With one compatible provider, new runs select it automatically.
With multiple providers, the user selects one before model setup.
Each saved run retains its provider ID. Provider loss never triggers automatic migration or retry.
Snapshots without a provider ID use `pi-agent-teams`.

Saved definitions contain the private skill text, assignments, gate history, and role-session history.
Resume uses the saved definition rather than reading a relocated package again.
Preset storage remains `state/pi-workflows/workflow-presets`; the refactor does not migrate user state.

`../__tests__/workflow-loader.test.ts` uses Pi's real loader with source and temporary symlink installations.
It covers unique registration, fresh runs, historical resume, missing providers, and child-session restrictions.
The tmux integration tests exercise the execution adapter.

## Event coverage and backend API

Workflow lifecycle tools execute roles only through the selected event client.
`WorkflowSubagentExecution` and `WorkflowToolDependencies.execution` no longer exist in `tools.ts`.
`WorkflowToolDependencies` contains only `state` and optional `eventExecution`.
The coordinator supplies the event client, and the workflow tools no longer track direct child execution.

The direct backend removal is a breaking API change.
Consumers must supply `eventExecution` instead of the removed `execution` dependency.
The shared subagent execution services remain available to ordinary agents and the tmux provider.
The removal affects only the duplicate workflow backend.

Both workflow suites now use the event backend.
Their child execution fixtures implement the provider's execution-services shape, not a production compatibility interface.
The coverage map records the former direct behaviors and their event tests.
All suite names refer to files in `../__tests__/`.
The named cases are test titles or searchable title fragments.
Tools, provider, client, and coordinator refer to their `workflow-*.test.ts` suites.
Coordinator integration refers to `workflow-coordinator.integration.test.ts`.

| Behavior from former direct lifecycle coverage | Event coverage | Migration notes |
| --- | --- | --- |
| Arbitrary roles, typed data, selected models, sidecars, asynchronous boundaries, and repository files | Synthetic full event lifecycle. Tools: arbitrary-role spawn and staged-change completion. | Real sidecars and correlated parent messages replace direct watcher return values. |
| Required profiles, parent sessions, provider availability, and saved identity | Tools: unavailable execution and missing parent sessions. Provider: saved identity, metadata readback, context, and model facts. Client: preflight. Coordinator: no compatible provider and child boundaries. | Availability comes from the selected provider. No fallback replaces the saved binding. |
| Model-only exposure, structured errors, and SDK codemode results | Tools: registration errors, SDK codemode, registered event-backed spawn, and early ping. Coordinator: registration and child restrictions. | Existing structured-result and exposure assertions use event dependencies. |
| Exclusive launch reservations and retry after cancellation or launch error | Tools: “reserves event ownership through preflight and acknowledgement” and “excludes concurrent provider-service launches” for all launch tools. | Tests cover both wire-level reentry and pending real provider services. |
| Cancelled spawn, resume, and recovery before or during launch | Tools: pending service cancellation and cancelled recovery gate. Coordinator integration: preflight, inspection, model selection, and pending starts. Provider: cancelled launch cleanup. | The real client waits for confirmed owned cleanup. Rejected calls do not retain a launch reservation. |
| Current saved session, fresh replacement, and historical session retention | Synthetic: same-session resume, fresh rollover, and both missing-lineage cases. Tools: current-session resume and historical rollover. | The provider confirms both durable lineage links before replacement. |
| Starting launch failure and post-launch cleanup failure | Tools: thrown shared resume and recovery. Synthetic: missing lineage. Coordinator integration: post-launch confirmation and cleanup failures. | The old session survives rejection. Cleanup ownership is not a successful launch. |
| Manifest recovery labels, readable handoff data, eligible failures, and original/current assignments | Synthetic and tools recovery cases. Coordinator integration: success, failure, cancellation, stop, ping-only, no-output, and provider loss. | Event tools own the picker and thinking labels. The service receives classified failure input and a canonical model, not `model: "pick"`. Promotion requires matching response evidence and a correlated completed result. |
| Strict failed stops and retained ownership | Tools: confirmed owned stop. Client: failed stop acknowledgement, timeout, and retry. Provider: watcher pane-close failure. Coordinator integration: failed cleanup blocks navigation. | A failed stop cannot release the role or permit navigation. |
| Pending navigation cleanup and stale callbacks across branches | Tools: pending spawn, same-session resume, rollover, and independent stale success/error/ping cases. Synthetic: revoked resume callbacks. Coordinator integration: overlapping cleanup with identical run IDs. | Tests retain state, session-history, sidecar, stop-count, and late-delivery assertions through the real provider. |
| Interrupted state and safe idle release after cancelled navigation or summarizer failure | Tools: all five SDK navigation phases, with the real provider bound to the SDK parent-session ID. Coordinator integration: restored launches and overlapping cleanup. | Cancelled handlers, successful summaries, failed summaries, and aborted summaries do not permit an early launch. The next idle prompt permits one launch. |
| Durable commit failure and failing result diagnostics | `workflow-coordinator.integration.test.ts`: durable append failure, completion persistence failure, and failing diagnostic UI. | The event path preserves prior durable state and blocks work until explicit reload. |
| Completion, abort, replacement, stale tokens, and durable reload | Synthetic: completion, stale tokens, package drift, and restored assignments/history. Tools: completion/abort audit data. Coordinator integration: owned cleanup before terminal transitions. | Audit assertions remain, without a direct execution dependency. |
| Unknown roles, skipped roles, optional roles, and readable handoff subsets | Tools: unknown roles, typed data, skipped mutation boundaries, and enabled optional-role rollover. Synthetic: typed data and role-readable handoffs. | Skipped roles cannot contact the provider or change session bytes, sidecars, state, UI, or processes. |

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
the task writer has no evaluation input. Missing output or `NOTHING
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

Workflow presets use `state/pi-workflows/workflow-presets` under the Pi agent directory.
Runs use the `pi-agent-teams.workflow-run` custom entry type and retain their saved definition and identity.
The execution provider ID remains `pi-agent-teams`.

Key rules in v1:

- workflow packages are `workflow.json` plus a private `SKILL.md`;
- the manifest is strict and versioned;
- role order is preserved exactly as declared;
- `optional: true` permits a saved `{ "skip": true }` assignment; omitted
  optional flags preserve the required-role behavior of existing v1 packages;
- normalized definitions are deep-frozen before they leave the loader.
