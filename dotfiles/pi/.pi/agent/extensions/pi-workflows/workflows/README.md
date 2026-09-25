# Workflow package authoring contract

Bundled, global, and trusted project workflows all use the same package shape:

```text
<workflow-package>/
├── workflow.json
└── SKILL.md
```

Authoring notes for schema version 1:

- `workflow.json` must declare `version`, `id`, `command`, `skill`, `data`,
  and `roles`.
- `skill` must stay inside the package directory and point at a markdown file.
- `data` supports:
  - `kind: "file"` with an optional repository-relative constraint:
    - `under`: required subtree path inside the repository;
    - `basename`: optional exact file name.
  - `kind: "string"` for refs, labels, or other scalar handoff values.
- Role `reads` reference declared data slots.
- Roles are required unless they declare `optional: true`. Optional roles
  still run by default, including in parent-model mode. Per-role setup and
  saved presets can assign `{ "skip": true }` instead of a provider/model/
  thinking object. Skip and model fields cannot be mixed; required roles
  cannot be skipped. A skipped role cannot spawn, resume, or recover.
- Role `writes` may include:
  - `worktree`
  - `file:<data-id>` for declared file slots only.

Private `SKILL.md` files are validated like skills, but they are not normal
discoverable Pi skills. Keep a small frontmatter block at the top:

```md
---
name: my-workflow
description: Orchestrate the workflow runtime for this package.
---

# Workflow

...
```

The bundled `peter/` package is the production example. Its `/peter` command is
generated from `workflow.json`; `/workflow run peter <request>` enters the same
startup path. Workflow skills must use `workflow_spawn`, `workflow_resume`,
`workflow_recover`, and `workflow_complete` for manifest roles rather than
ordinary subagent lifecycle tools.

Peter declares five roles: planner, optional evaluator, task-writer, executor,
reviewer. Its phases are Plan, Evaluate, Tasks, Execute, Review, and an
authorized Fix pass. Evaluation writes only `EVALUATION.md`, beside `PLAN.md`.
The planner can read it for user-selected findings; the task writer cannot.
Skipping evaluation is a saved role choice, not an implicit response to errors.
There is no bundled `/pter` compatibility alias or preset migration. Old runs
continue from their saved definitions without being renamed.

## Asynchronous browser gates

Private skills may use this parent-only tool between role runs:

```text
workflow_gate({
  runId: "<active run ID>",
  gate: "plan",
  artifact: "plan",
  reviewDirectory: true,
  data: { plan: "<absolute PLAN.md path>" }
})
```

`artifact` is a declared file slot, not a path. `data` and `reviewDirectory`
are optional; directory mode reviews the artifact's parent. Labels must be
safe. Targets must be readable and canonically inside the project. Do not
run a background shell or poll: the native tool returns immediately, exposes
the URL when available, and sends `workflow_gate_result` after process
closure. The skill maps approved/annotated/dismissed decisions; the tool does
not choose phases or interpret findings.

Each attempt has a unique result file in the artifact directory's sibling
`<directory-name>-decisions/`, never inside the reviewed folder. The original
file is the authoritative full result. Feedback is persisted verbatim; do
not put it in generic string slots, which trim whitespace. Wrap it between
delimiters inside role instructions so leading/trailing whitespace survives
continuation and rollover. Keep folder feedback unchanged and explain that
per-file sections are authoritative, not the duplicate `Folder Feedback`.

No gate may overlap a running role, and no role may launch while a gate is
pending. Failed, malformed, missing, dismissed, or interrupted results never
mean approval. Define a chat fallback for every browser gate. On resume,
unfinished attempts are interrupted: use that fallback and wait for a fresh
answer rather than reconnecting to old processes or accepting later output.
Completed history preserves context without replaying phases. Shutdown,
reload, abort, and replacement preserve all files while stopping owned gates.

Peter checks `command -v plannotator` once, uses browser review at Gates 1–3
when available, and keeps Gate 4 as an explicit chat re-review choice.
