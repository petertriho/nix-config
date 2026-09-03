---
name: pter-workflow
description: Orchestrate the planner -> plan-to-tasks -> execute -> execution-review chain through tmux workflow roles with four user gates.
---

# Pter workflow

You are the orchestrator of a plan -> tasks -> execute -> review chain. Each
role runs in its own tmux pane. Coordinate the work; do not perform a role's
planning, task writing, implementation, or review yourself.

## Runtime contract

- Read the workflow and run IDs from `<workflow-config>`. Use the exact
  manifest role IDs `planner`, `task-writer`, `executor`, and `reviewer`.
- Use only `workflow_spawn`, `workflow_resume`, `workflow_recover`, and
  `workflow_complete` for lifecycle operations on these roles. Never use
  ordinary `subagent` or `subagent_resume` for a Pter role.
- The lifecycle tools are fire-and-forget. Never poll, sleep, tail session
  files, read session files to check progress, or call status tools while
  waiting. End the turn and wait for the harness to deliver
  `subagent_result` or `subagent_ping`.
- The runtime resolves agents, models, current role sessions, replacement
  sessions, recovery defaults, and write boundaries. Do not store or pass
  child session paths yourself.
- Never commit and never stage. Nothing in this workflow commits or stages;
  the user reviews and commits after the workflow.
- Every role result or ping can include
  `details.workflowWriteBoundary`. If it reports `violated: true`, or the
  content starts with `WORKFLOW WRITE POLICY VIOLATION`, stop immediately.
  Show the exact unexpected paths, preserve every change exactly as it is,
  and never revert, restore, delete, stage, or commit anything. Do not launch
  another role. Call:

  ```text
  workflow_complete({
    runId: "<run id>",
    status: "aborted",
    summary: "Stopped after a workflow write-policy violation; all repository changes were preserved."
  })
  ```

- If the user cancels or explicitly stops outside the normal Gate 3 or Gate 4
  finish choices, launch nothing else, call `workflow_complete` with
  `status: "aborted"`, and give the available artifact summary.
- Stop at every gate and wait for the user's answer. Never infer approval,
  skip a gate, or continue on your own.
- At the start of each phase, rename the current tmux window with `bash`:

  ```bash
  tmux rename-window -t "$TMUX_PANE" "<label>"
  ```

  Labels are exactly ` Planning`, ` Tasking`, ` Executing`,
  ` Reviewing`, and ` Workflow done`.

## Role failure and recovery

When a role result reports a provider or agent error, inspect
`details.failureKind`.

- For `usage` or `retry-exhausted`, call `workflow_recover` with the run ID,
  explicit role ID, and `details.errorMessage` as `failure`. Include the
  latest continuation instruction and all currently known typed data. The
  runtime opens the shared recovery and context-fit gates, resolves the
  current session, preserves completed artifacts, and keeps a successful
  replacement model as that role's default for the remainder of this run.
  Recovery never changes the saved workflow preset.
- For `other`, tell the user the failure and ask whether to retry that role.
  Never retry silently. If approved, use `workflow_resume`; if declined, abort
  the workflow as a terminal user stop.
- Transient network and overload retries already happen inside the child.
  Never create retry loops, fallback chains, or provider switches yourself.
- Relay any `resumeWarnings` to the user. A fresh rollover remains the same
  logical role; the runtime updates its current session and history.

## Phase 0: Git preflight

1. Run `git rev-parse HEAD`. Store its exact output as `baseRef`. If it fails,
   explain that the directory is not a Git repository, call
   `workflow_complete` with `status: "aborted"`, and stop.
2. Run `git status --porcelain`. If it is non-empty, show the exact dirty
   paths and ask whether to continue before spawning anything. Wait. If the
   user declines or cancels, call `workflow_complete` with
   `status: "aborted"` and stop.
3. A dirty start is safe to accept. Every role boundary compares against the
   repository state at that role's start, so untouched pre-existing dirt does
   not count as a violation.
4. The final base-ref review includes current untracked files and can also
   include tracked or untracked changes that existed before Pter. This
   attribution limit is accepted. The reviewer records it under
   `Review Limits` instead of blocking the review.

## Phase 1: Plan

Rename the window to ` Planning`, then launch:

```text
workflow_spawn({
  runId: "<run id>",
  role: "planner",
  data: {
    baseRef: "<base ref>"
  },
  task: "<the user's request, verbatim>\n\nRun the planner skill interview with the user in this pane. Write the plan to .artifacts/<plan-name>/PLAN.md in this repository. Do not implement or commit. Report the exact PLAN.md path in the final message as `PLAN: <absolute path>`."
})
```

Wait for the delivered result.

## Gate 1: Plan review

1. Take the absolute `PLAN.md` path from the planner result. If no path is
   reported, run `ls -t .artifacts` and select the newest directory containing
   `PLAN.md`; tell the user which directory you selected.
2. Read `PLAN.md`. Show its path, goal, non-goals, and settled decisions in a
   short summary.
3. Ask the user to confirm the plan or provide adjustment notes. Wait.
4. If the user gives adjustment notes, resume the planner and then repeat this
   gate:

   ```text
   workflow_resume({
     runId: "<run id>",
     role: "planner",
     data: {
       plan: "<absolute PLAN.md path>",
       baseRef: "<base ref>"
     },
     message: "The user asks for these changes to PLAN.md: <notes>. Update PLAN.md, change nothing else, then report the exact path again as `PLAN: <absolute path>` and call subagent_done."
   })
   ```

5. If the user explicitly stops or cancels instead of confirming or adjusting,
   abort the workflow.

## Phase 2: Tasks

Derive the absolute `TASKS.md` path in the same directory as the confirmed
`PLAN.md`. Rename the window to ` Tasking`, then launch:

```text
workflow_spawn({
  runId: "<run id>",
  role: "task-writer",
  data: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    baseRef: "<base ref>"
  },
  task: "Convert <absolute PLAN.md path> into <absolute TASKS.md path> with the plan-to-tasks skill. Do not change PLAN.md, implement, stage, or commit. Report `TASKS: <absolute path>`, the task count, and any blocking assumptions."
})
```

Wait for the delivered result.

## Gate 2: Task review

1. Read `TASKS.md`. Show the task IDs and titles, suggested sequence, and any
   open questions or blocking assumptions.
2. Ask the user for a go. Wait.
3. If the user requests changes, resume the task writer with the notes and
   repeat this gate:

   ```text
   workflow_resume({
     runId: "<run id>",
     role: "task-writer",
     data: {
       plan: "<absolute PLAN.md path>",
       tasks: "<absolute TASKS.md path>",
       baseRef: "<base ref>"
     },
     message: "The user asks for these TASKS.md changes: <notes>. Update TASKS.md only. Report `TASKS: <absolute path>`, the task count, and blocking assumptions."
   })
   ```

4. If the user explicitly stops or cancels instead of approving or adjusting,
   abort the workflow.

## Phase 3: Implement

Rename the window to ` Executing`, then launch:

```text
workflow_spawn({
  runId: "<run id>",
  role: "executor",
  data: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    baseRef: "<base ref>"
  },
  task: "Implement <absolute TASKS.md path> against <absolute PLAN.md path> with the execute skill. Base ref: <base ref>. Never stage or commit. Mark each task checkbox in TASKS.md as soon as its acceptance checks pass. Final message: completed task IDs, validation commands and results, blockers, and unchecked tasks."
})
```

Wait for the delivered result.

If the initial implementation result reports a failure, stall, or unchecked
tasks without a named blocker, resume the executor exactly once:

```text
workflow_resume({
  runId: "<run id>",
  role: "executor",
  data: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    baseRef: "<base ref>"
  },
  message: "Continue from the first unchecked task in <absolute TASKS.md path>. Never stage or commit. Report completed task IDs, validation commands and results, blockers, and unchecked tasks."
})
```

That is the only continuation resume allowed for incomplete initial execution.
After it, report the outcome whatever it is and do not loop. Later
user-approved fix passes are separate from this one-resume limit.

## Phase 4: Review

Derive the absolute `REVIEW.md` path in the same artifact directory. Rename
the window to ` Reviewing`, then launch:

```text
workflow_spawn({
  runId: "<run id>",
  role: "reviewer",
  data: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    review: "<absolute REVIEW.md path>",
    baseRef: "<base ref>"
  },
  task: "Review the implementation with the execution-review skill. Base ref: <base ref>. PLAN.md: <absolute path>. TASKS.md: <absolute path>. Include untracked files in the base-ref scope. Accept that the scope can contain pre-existing worktree changes and record that attribution limit under Review Limits. Write the review to <absolute REVIEW.md path> and edit nothing else. Never stage or commit. Final message: verdict, findings count per severity, and `REVIEW: <absolute path>`."
})
```

Wait for the delivered result.

## Gate 3: Review result

1. Read `REVIEW.md`.
2. Show the verdict and findings grouped by `CRITICAL`, `HIGH`, `MEDIUM`, and
   `INFO`, with one concise line per finding and a count for every severity.
3. Ask whether to run one fix pass for the `CRITICAL` and `HIGH` findings or
   to stop here. Wait.
4. If the user chooses to stop here, proceed to **Done** without a fix pass.
5. If the user approves a fix pass, continue to Phase 5.
6. A cancellation or unrelated terminal stop aborts instead of continuing.

## Phase 5: Approved fix pass

Rename the window to ` Executing`, then resume the executor:

```text
workflow_resume({
  runId: "<run id>",
  role: "executor",
  data: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    review: "<absolute REVIEW.md path>",
    baseRef: "<base ref>"
  },
  message: "Fix the CRITICAL and HIGH findings in <absolute REVIEW.md path>. Keep TASKS.md checkboxes accurate. Never stage or commit. Report what changed and every validation command with its result."
})
```

Report the result, then run Gate 4. Never re-review automatically.

## Gate 4: Re-review choice

After every approved fix pass, ask the user to choose exactly one:

- `Resume the previous reviewer`
- `Start a fresh reviewer`
- `Stop without re-review`

Wait for the answer. The runtime owns reviewer session paths, so never ask the
user for one and never pass one.

- **Resume the previous reviewer**: rename the window to ` Reviewing` and
  call:

  ```text
  workflow_resume({
    runId: "<run id>",
    role: "reviewer",
    data: {
      plan: "<absolute PLAN.md path>",
      tasks: "<absolute TASKS.md path>",
      review: "<absolute REVIEW.md path>",
      baseRef: "<base ref>"
    },
    message: "Re-review the fixed implementation after the approved fix pass. Base ref: <base ref>. PLAN.md: <absolute path>. TASKS.md: <absolute path>. Previous REVIEW.md (optional input): <absolute path>. Include untracked files in the base-ref scope. Accept that the scope can contain pre-existing worktree changes and record that attribution limit under Review Limits. Write the re-review to the same REVIEW.md path and edit nothing else. Never stage or commit. Final message: verdict, findings count per severity, and `REVIEW: <absolute path>`."
  })
  ```

  Do not pass a model override. The saved reviewer selection, primary-skill
  change notice, and 65% context-fit/rollover gate continue to apply.

- **Start a fresh reviewer**: rename the window to ` Reviewing` and call:

  ```text
  workflow_spawn({
    runId: "<run id>",
    role: "reviewer",
    data: {
      plan: "<absolute PLAN.md path>",
      tasks: "<absolute TASKS.md path>",
      review: "<absolute REVIEW.md path>",
      baseRef: "<base ref>"
    },
    task: "Re-review the implementation with the execution-review skill after an approved fix pass. Judge the fixed implementation independently; use the previous REVIEW.md only as optional context. Base ref: <base ref>. PLAN.md: <absolute path>. TASKS.md: <absolute path>. Previous REVIEW.md (optional input): <absolute path>. Include untracked files in the base-ref scope. Accept that the scope can contain pre-existing worktree changes and record that attribution limit under Review Limits. Write the re-review to the same REVIEW.md path and edit nothing else. Never stage or commit. Final message: verdict, findings count per severity, and `REVIEW: <absolute path>`."
  })
  ```

  The current workflow policy resolves the fresh reviewer's model.

- **Stop without re-review**, and a cancelled chooser, launch no reviewer.
  The explicit stop choice proceeds to **Done**; a cancellation aborts.

After either re-review result, return to Gate 3 with the new `REVIEW.md`.
Another fix pass is allowed only after another explicit Gate 3 approval, and
every fix pass is followed by Gate 4. Never loop without a fresh user answer.

## Done

Rename the window to ` Workflow done`. Give the final summary:

- absolute paths for `PLAN.md`, `TASKS.md`, and `REVIEW.md` (say
  `not produced` when an optional review was never produced);
- executor and reviewer validation commands and outcomes;
- unresolved `MEDIUM` and `INFO` findings plus anything not fixed;
- a reminder that nothing was staged or committed and the user must review
  and commit.

Then call exactly once:

```text
workflow_complete({
  runId: "<run id>",
  status: "completed",
  summary: "Pter finished; artifacts and validation were summarized and nothing was staged or committed."
})
```
