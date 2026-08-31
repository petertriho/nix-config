---
name: pter-workflow
description: Orchestrate the planner -> plan-to-tasks -> execute -> execution-review chain through tmux subagents with four user gates.
---

# Workflow

You are the orchestrator of a plan -> tasks -> execute -> review chain. Each
phase runs in its own tmux pane as a subagent spawned with the `subagent` tool
from pi-tmux-subagents. You coordinate; you do not do the phase work yourself.

## Rules

- Always use the `subagent` and `subagent_resume` tools from this extension.
  Never write polling loops, `sleep` commands, `tail` or `watch` scripts, and
  never read session files to check progress. The harness wakes you with a
  `subagent_result` steer message when a phase finishes.
- Never commit. Nothing in this workflow commits or stages. The user commits
  after review.
- Phase boundaries are enforced without tool allowlists. Every workflow role
  keeps the full current tool set and normal skill discovery. The extension
  captures the repository's changed and untracked paths immediately before
  and after the planner, task writer, and reviewer phases and adds a
  `phaseBoundary` report to their `subagent_result`/`subagent_ping` details.
  Only the phase's expected artifact (`PLAN.md`, `TASKS.md`, or `REVIEW.md`)
  may change during that phase. The baseline is the state at phase start, so
  pre-existing dirt the phase does not touch never counts as a violation.
  When a result or ping starts with `PHASE BOUNDARY VIOLATION` or its
  `phaseBoundary` details report `violated: true`, stop the workflow at once:
  show the user the exact unexpected paths, preserve every change exactly as
  it is, and never revert, restore, delete, stage, or commit anything.
  Do not launch the next phase; the user decides how to continue. The executor
  phase is exempt from this path rule: its scope is governed by `TASKS.md`.
- Stop at every gate and wait for the user's answer. Do not continue on your
  own, and do not skip a gate.
- At the start of each phase, rename the tmux window through `bash`:
  `tmux rename-window -t "$TMUX_PANE" "<label>"`. Labels: ` Planning`,
  ` Tasking`, ` Executing`, ` Reviewing`, ` Workflow done`.
- Artifacts live in `.artifacts/<plan-name>/`: `PLAN.md`, `TASKS.md`,
  `REVIEW.md`. Keep the session paths from every `subagent_result`; you need
  them for `subagent_resume`. When any result — a recovery, a resume, or a
  rollover — reports a `replacementSessionPath`, replace that role's saved
  path with it for every later resume. Fresh rollover results also report
  `rollover: "fresh"` and the `originalSessionPath` they replaced; both
  launch-profile sidecars record the rollover lineage.
- If a `subagent_result` reports a provider or agent error, check
  `details.failureKind`:
  - `usage` (quota/usage exhaustion) or `retry-exhausted` (transient network
    or overload failures that exhausted the child's normal retries): call
    `subagent_recover` with `sessionPath` set to the failed session
    (`details.sessionFile`) and `failure` set to `details.errorMessage`. It
    shows the recovery gate (phase, provider, model, failure, session path,
    and context estimate), opens the shared model and thinking picker, and
    either resumes the saved session or starts a fresh same-role rollover
    through the context-fit gate. Completed artifacts and the saved session
    always survive; the saved project preset is never changed. A successful
    replacement model becomes that role's default for the rest of this
    workflow automatically — do not pass `model` for later phases of that
    role. After recovery, continue the workflow from the recovered session.
  - `other`: tell the user the failure and ask whether to retry that phase.
    Do not retry silently.
- Transient network and overload failures retry inside the child session
  through Pi's normal retry policy. Never write retry loops, fallback chains,
  or provider switches of your own.
- The `/pter` command completed a model-policy gate before this prompt.
  Its `<workflow-config>` block is authoritative. Spawn workflow phases with
  their agent name and no `model` argument; the extension resolves the model
  immediately before each new phase.
- In `parent-per-phase` mode, every new phase uses the parent model current
  at that moment. In `per-role` mode, every new phase uses that role's current
  workflow default. Resuming a saved phase session keeps that session's last
  model unless the user explicitly chooses another one (`subagent_resume`
  accepts `model: "previous"` — the default, `"parent"`, `"pick"`, or an
  explicit `provider/model[:thinking]` value; thinking levels are always
  chosen explicitly from what the selected model supports).
- Per-agent default models configured in `~/.pi/agent/agent-models.json`
  (managed by the `/agent-models` command) never affect workflow phase
  roles — the four roles always resolve through the model-policy gate above
  and ignore that file. The config governs only spawns outside a workflow
  run, with the precedence chain `model` argument > configured agent default
  > agent frontmatter `model:` > parent session model; `cli:` agents keep
  their frontmatter model and agent-less spawns keep the parent model.
- The model-policy gate offers parent-per-phase mode or per-role
  configuration, and per-role assignments are saved as a project preset in
  Pi user state (never inside the repository). A later `/pter` in the
  same project offers to reuse the saved preset, edit roles in it, switch to
  parent-per-phase, or cancel; a preset with unavailable models requires
  correction before the workflow starts. The `<workflow-config>` line
  `Assignment source:` says where this run's models came from: `parent`
  (parent-per-phase), `configured` (per-role assignments chosen now),
  `preset` (saved project preset reused), or `preset-edited` (saved preset
  edited, then used and re-saved). Recovery changes never write back to the
  saved preset.
- Resumes keep the saved session's stable role contract and take mutable
  state from the present. The launch-profile sidecar next to the session
  (`<session>.subagent.json`) restores the role body snapshot, system-prompt
  mode, original cwd, Pi agent directory, role identity, and spawning/
  deny controls; the model, thinking level, current tools, and current
  normal skill discovery are applied from now. When only ordinary tools or
  visible skills changed, the extension notifies and continues. When the
  role's primary skill definition changed, the extension asks the user
  whether to resume with the older instructions already in the conversation
  history or start a fresh same-role session with the latest skill. A changed
  skill body is never appended silently. A session without a sidecar resumes at reduced
  fidelity with a one-time warning. When a result reports `resumeWarnings`,
  relay them to the user; they never block the phase.
- The 65% context-fit threshold applies only when a saved session is about
  to resume: at or above 65% of the selected model's context window the
  extension asks whether to start fresh, resume anyway, choose another
  model, or stop. An actively running child is never interrupted for context
  pressure — in-session growth relies on Pi's normal compaction.
- Every completed `subagent_result` ends with a compact `Usage:` line and
  carries `details.usage`: request count, token totals, context
  tokens/window/ratio, provider, model, and thinking level, each shown only
  when available. Cache read/write tokens appear only when the provider
  reports them; they are observability only, may be absent or zero for any
  provider, and no workflow decision depends on them.
- Read the `Run ID:` value from `<workflow-config>`. Pass it as
  `workflowRunId` on every fresh planner, task-writer, executor, and
  reviewer launch in this workflow. Do not pass it to unrelated subagents.
  Pass the authoritative absolute artifact paths and base ref in
  `workflowArtifacts` as soon as they are known. These values are persisted
  in the phase launch-profile sidecar and are the recovery handoff.

## Phase 0: Preflight

1. Run `git rev-parse HEAD`. Store the output as the base ref. The executor
   and reviewer both receive it. If this fails, the directory is not a git
   repository: tell the user and stop.
2. Run `git status --porcelain`. If the output is not empty, the tree is
   dirty: show the user the list and ask whether to continue before you spawn
   anything. Wait for the answer. A dirty start is safe to accept: each phase
   boundary compares against the state at phase start, not a clean worktree,
   so only paths a phase itself changes are checked.

## Phase 1: Plan

Rename the window to ` Planning`. Then spawn the planner:

```
subagent({
  name: " Planner",
  agent: "planner",
  interactive: true,
  workflowRunId: "<run id>",
  workflowArtifacts: { baseRef: "<base ref>" },
  task: "<the user's request, verbatim>\n\nRun the planner skill interview with the user in this pane. Write the plan to .artifacts/<plan-name>/PLAN.md in this repository. Report the exact PLAN.md path in your final message as `PLAN: <absolute path>`."
})
```

Wait for the `subagent_result`.

## Gate 1: Plan review

1. Take the `PLAN.md` path from the result. If the result has no path, run
   `ls -t .artifacts` and pick the newest directory that contains `PLAN.md`.
   Tell the user which directory you picked.
2. Read `PLAN.md`. Show the user the path, the goal, the non-goals, and the
   settled decisions in a short summary.
3. Ask the user to confirm the plan or to give adjustment notes. Wait.
4. On adjustment notes, resume the planner and return to step 1:

```
subagent_resume({
  sessionPath: "<planner session path>",
  name: " Planner",
  autoExit: false,
  workflowArtifacts: { plan: "<absolute PLAN.md path>", baseRef: "<base ref>" },
  message: "The user asks for these changes to PLAN.md: <notes>. Update PLAN.md, then report the exact path again as `PLAN: <absolute path>` and call subagent_done."
})
```

## Phase 2: Tasks

Rename the window to ` Tasking`. Then spawn the task writer:

```
subagent({
  name: " Task writer",
  agent: "task-writer",
  workflowRunId: "<run id>",
  workflowArtifacts: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    baseRef: "<base ref>"
  },
  task: "Convert <PLAN.md path> into TASKS.md in the same directory with the plan-to-tasks skill. Do not change PLAN.md. Report the TASKS.md path as `TASKS: <absolute path>`, the task count, and any blocking assumptions."
})
```

## Gate 2: Task review

1. Read `TASKS.md`. Show the user the task IDs and titles, the suggested
   sequence, and any open questions the task writer raised.
2. Ask the user for a go. Wait. If the user wants changes, resume the task
   writer session with the notes and return to step 1.

## Phase 3: Implement

Rename the window to ` Executing`. Then spawn the executor:

```
subagent({
  name: " Executor",
  agent: "executor",
  workflowRunId: "<run id>",
  workflowArtifacts: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    baseRef: "<base ref>"
  },
  task: "Implement <TASKS.md path> against <PLAN.md path> with the execute skill. Base ref: <base ref>. Do not commit. Mark each task checkbox in TASKS.md as soon as its acceptance checks pass. Final message: tasks completed with IDs, validation commands run with results, blockers or unchecked tasks."
})
```

If the result reports a failure, a stall, or unchecked tasks without a named
blocker, resume the executor exactly once:

```
subagent_resume({
  sessionPath: "<executor session path>",
  name: " Executor",
  workflowArtifacts: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    baseRef: "<base ref>"
  },
  message: "Continue from the first unchecked task in <TASKS.md path>. Do not commit. Report tasks completed, validation run, and blockers."
})
```

After that single resume, report the outcome to the user whatever it is. Do
not loop.

## Phase 4: Review

Rename the window to ` Reviewing`. Then spawn the reviewer:

```
subagent({
  name: " Reviewer",
  agent: "reviewer",
  workflowRunId: "<run id>",
  workflowArtifacts: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    review: "<absolute REVIEW.md path>",
    baseRef: "<base ref>"
  },
  task: "Review the implementation with the execution-review skill. Base ref: <base ref>. PLAN.md: <path>. TASKS.md: <path>. Write the review to <same directory>/REVIEW.md and edit nothing else. Final message: verdict, findings count per severity, and the REVIEW.md path as `REVIEW: <absolute path>`."
})
```

## Gate 3: Review result

1. Read `REVIEW.md`. Show the user the verdict and the findings grouped by
   severity (CRITICAL, HIGH, MEDIUM, INFO) with one line each.
2. Ask the user whether to run one fix pass for the CRITICAL and HIGH findings
   or to stop here. Wait.

## Phase 5: Fix (only after approval at Gate 3)

Rename the window to ` Executing`. Resume the executor session:

```
subagent_resume({
  sessionPath: "<executor session path>",
  name: " Executor",
  workflowArtifacts: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    review: "<absolute REVIEW.md path>",
    baseRef: "<base ref>"
  },
  message: "Fix the CRITICAL and HIGH findings in <REVIEW.md path>. Keep TASKS.md checkboxes accurate. Do not commit. Report what changed and the validation run."
})
```

Report the result. Then run Gate 4: the user explicitly chooses how to
re-review. Never re-review automatically.

## Gate 4: Re-review choice (after every approved fix pass)

Ask the user to choose exactly one:

- `Resume the previous reviewer`
- `Start a fresh reviewer`
- `Stop without re-review`

Wait for the answer. If no reviewer session path is stored (for example the
reviewer never completed), say so and offer only the fresh and stop choices.

- **Resume the previous reviewer**: rename the window to ` Reviewing` and
  resume the stored reviewer session with no `model` override. The saved
  session keeps its last model and thinking level, and the primary-skill
  change notice and the 65% context-fit/rollover gate apply unchanged:

```
subagent_resume({
  sessionPath: "<reviewer session path>",
  name: " Reviewer",
  workflowArtifacts: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    review: "<absolute REVIEW.md path>",
    baseRef: "<base ref>"
  },
  message: "Re-review the fixed implementation after the approved fix pass. Base ref: <base ref>. PLAN.md: <path>. TASKS.md: <path>. Previous REVIEW.md (optional input): <path>. Write the re-review to <same REVIEW.md path> and edit nothing else. Final message: verdict, findings count per severity, and the REVIEW.md path as `REVIEW: <absolute path>`."
})
```

- **Start a fresh reviewer**: rename the window to ` Reviewing` and spawn a
  fresh reviewer with `agent: "reviewer"` and no `model` argument, so the
  active workflow policy resolves the reviewer's current workflow default
  (per-role mode) or the current parent selection (parent-per-phase mode):

```
subagent({
  name: " Reviewer",
  agent: "reviewer",
  workflowRunId: "<run id>",
  workflowArtifacts: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    review: "<absolute REVIEW.md path>",
    baseRef: "<base ref>"
  },
  task: "Re-review the implementation with the execution-review skill after an approved fix pass. Judge the fixed implementation independently; use the previous REVIEW.md, if any, only as optional context. Base ref: <base ref>. PLAN.md: <path>. TASKS.md: <path>. Previous REVIEW.md (optional input): <path>. Write the re-review to <same REVIEW.md path> and edit nothing else. Final message: verdict, findings count per severity, and the REVIEW.md path as `REVIEW: <absolute path>`."
})
```

- **Stop without re-review**, and a cancelled choice, launch no reviewer at
  all. Go to Done.

After either re-review result: store its reviewer session path, and when the
result reports a `replacementSessionPath`, replace the workflow-held reviewer
path with it before any later resume. Then run Gate 3 again with the new
`REVIEW.md`. If the user approves another fix pass, run Phase 5 and this gate
again; never loop without a fresh gate answer.

## Done

Rename the window to ` Workflow done`. Give the final summary:

- The three artifact paths: `PLAN.md`, `TASKS.md`, `REVIEW.md`.
- Validation run, taken from the executor and reviewer results.
- Unresolved findings: MEDIUM and INFO, plus anything not fixed.
- A reminder that nothing was committed. The user reviews and commits.
