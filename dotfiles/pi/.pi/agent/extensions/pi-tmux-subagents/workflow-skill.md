---
name: workflow
description: Orchestrate the planner -> plan-to-tasks -> implement -> implementation-review chain through tmux subagents with three user gates.
---

# Workflow

You are the orchestrator of a plan -> tasks -> implement -> review chain. Each
phase runs in its own tmux pane as a subagent spawned with the `subagent` tool
from pi-tmux-subagents. You coordinate; you do not do the phase work yourself.

## Rules

- Always use the `subagent` and `subagent_resume` tools from this extension.
  Never write polling loops, `sleep` commands, `tail` or `watch` scripts, and
  never read session files to check progress. The harness wakes you with a
  `subagent_result` steer message when a phase finishes.
- Never commit. Nothing in this workflow commits or stages. The user commits
  after review.
- Stop at every gate and wait for the user's answer. Do not continue on your
  own, and do not skip a gate.
- At the start of each phase, rename the tmux window through `bash`:
  `tmux rename-window -t "$TMUX_PANE" "<label>"`. Labels: ` Planning`,
  ` Tasking`, ` Implementing`, ` Reviewing`, ` Workflow done`.
- Artifacts live in `.artifacts/<plan-name>/`: `PLAN.md`, `TASKS.md`,
  `REVIEW.md`. Keep the session paths from every `subagent_result`; you need
  them for `subagent_resume`.
- If a `subagent_result` reports a provider or agent error, tell the user and
  ask whether to retry that phase. Do not retry silently.

## Phase 0: Preflight

1. Run `git rev-parse HEAD`. Store the output as the base ref. The implementer
   and reviewer both receive it.
2. Run `git status --porcelain`. If the output is not empty, the tree is
   dirty: show the user the list and ask whether to continue before you spawn
   anything. Wait for the answer.
3. If the directory is not a git repository, tell the user and stop.

## Phase 1: Plan

Rename the window to ` Planning`. Then spawn the planner:

```
subagent({
  name: " Planner",
  agent: "planner",
  interactive: true,
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
  message: "The user asks for these changes to PLAN.md: <notes>. Update PLAN.md, then report the exact path again as `PLAN: <absolute path>` and call subagent_done."
})
```

## Phase 2: Tasks

Rename the window to ` Tasking`. Then spawn the task writer:

```
subagent({
  name: " Task writer",
  agent: "task-writer",
  task: "Convert <PLAN.md path> into TASKS.md in the same directory with the plan-to-tasks skill. Do not change PLAN.md. Report the TASKS.md path as `TASKS: <absolute path>`, the task count, and any blocking assumptions."
})
```

## Gate 2: Task review

1. Read `TASKS.md`. Show the user the task IDs and titles, the suggested
   sequence, and any open questions the task writer raised.
2. Ask the user for a go. Wait. If the user wants changes, resume the task
   writer session with the notes and return to step 1.

## Phase 3: Implement

Rename the window to ` Implementing`. Then spawn the implementer:

```
subagent({
  name: " Implementer",
  agent: "implementer",
  task: "Implement <TASKS.md path> against <PLAN.md path> with the implement skill. Base ref: <base ref>. Do not commit. Mark each task checkbox in TASKS.md as soon as its acceptance checks pass. Final message: tasks completed with IDs, validation commands run with results, blockers or unchecked tasks."
})
```

If the result reports a failure, a stall, or unchecked tasks without a named
blocker, resume the implementer exactly once:

```
subagent_resume({
  sessionPath: "<implementer session path>",
  name: " Implementer",
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
  task: "Review the implementation with the implementation-review skill. Base ref: <base ref>. PLAN.md: <path>. TASKS.md: <path>. Write the review to <same directory>/REVIEW.md and edit nothing else. Final message: verdict, findings count per severity, and the REVIEW.md path as `REVIEW: <absolute path>`."
})
```

## Gate 3: Review result

1. Read `REVIEW.md`. Show the user the verdict and the findings grouped by
   severity (CRITICAL, HIGH, MEDIUM, INFO) with one line each.
2. Ask the user whether to run one fix pass for the CRITICAL and HIGH findings
   or to stop here. Wait.

## Phase 5: Fix (only after approval at Gate 3)

Rename the window to ` Implementing`. Resume the implementer session:

```
subagent_resume({
  sessionPath: "<implementer session path>",
  name: " Implementer",
  message: "Fix the CRITICAL and HIGH findings in <REVIEW.md path>. Keep TASKS.md checkboxes accurate. Do not commit. Report what changed and the validation run."
})
```

Report the result. Re-review only if the user asks; then repeat Phase 4 and
Gate 3 once.

## Done

Rename the window to ` Workflow done`. Give the final summary:

- The three artifact paths: `PLAN.md`, `TASKS.md`, `REVIEW.md`.
- Validation run, taken from the implementer and reviewer results.
- Unresolved findings: MEDIUM and INFO, plus anything not fixed.
- A reminder that nothing was committed. The user reviews and commits.
