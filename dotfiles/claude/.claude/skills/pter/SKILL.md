---
name: pter
description: "Orchestrate the planner -> plan-to-tasks -> execute -> execution-review chain through Claude Code subagents with four user gates: plan review, task review, review result, and re-review choice."
disable-model-invocation: true
---

# pter

You are the orchestrator of a plan -> tasks -> execute -> review chain. The
plan phase runs inline in this conversation through the `Skill` tool, because
subagents cannot reach the user. The task writer, the executor, and the
reviewer each run as a fresh general-purpose subagent spawned with the `Agent`
tool. You coordinate; you do not do the phase work yourself.

## Rules

- Never commit or stage anything. Nothing in this workflow commits. The user
  commits after review.
- Stop at every gate and wait for the user's answer. Do not continue on your
  own, and do not skip a gate.
- Artifacts live in `.artifacts/<plan-name>/`: `PLAN.md`, `TASKS.md`,
  `REVIEW.md`. Keep the agent name from every spawn; you need it to continue
  that subagent with `SendMessage`.
- Phase boundaries for the task writer and the reviewer are enforced with git
  snapshots. Immediately before every task-writer or reviewer run — a fresh
  spawn or a `SendMessage` continuation — run `git status --porcelain` and
  keep the output. When the run finishes, run it again and compare. Only the
  phase's expected artifact (`TASKS.md` or `REVIEW.md`) may change during that
  phase. The baseline is the state at phase start, so pre-existing dirt the
  phase does not touch never counts as a violation. On a violation, stop the
  workflow at once: show the user the exact unexpected paths, preserve every
  change exactly as it is, and never revert, restore, delete, stage, or commit
  anything. Do not start the next phase; the user decides how to continue.
  The executor is exempt from this path rule: its scope is governed by
  `TASKS.md`. The inline planner is governed by the planner skill's own write
  rule.
- The subagent phase skills (`plan-to-tasks`, `execute`,
  `execution-review`) set `disable-model-invocation: true`, so the
  `Skill` tool refuses every model-initiated load. Subagents must not call
  the `Skill` tool for them. Every spawn prompt instead tells the subagent to
  read `~/.claude/skills/<name>/SKILL.md` directly, follow it as its
  operating instructions, and resolve the skill's relative references against
  `~/.claude/skills/<name>/`; the direct read is the intended loading path
  for this workflow.
- To continue a finished subagent, use `SendMessage` with its stored agent
  name. If the continuation fails or the agent is gone, spawn a fresh
  subagent of the same role and pass it the artifact paths and the base ref.
- On any other subagent failure, report the failure to the user and ask
  before retrying that phase. Do not retry silently.
- At the start of each phase, if `$TMUX_PANE` is set, rename the tmux window
  through `bash`: `tmux rename-window -t "$TMUX_PANE" "<label>"`. Labels:
  ` Planning`, ` Tasking`, ` Executing`, ` Reviewing`,
  ` Workflow done`. If `$TMUX_PANE` is not set, skip every rename.

## Phase 0: Preflight

1. Run `git rev-parse HEAD`. Store the output as the base ref. The executor
   and the reviewer both receive it. If this fails, the directory is not a git
   repository: tell the user and stop.
2. Run `git status --porcelain`. If the output is not empty, the tree is
   dirty: show the user the list and ask whether to continue before you spawn
   anything. Wait for the answer. A dirty start is safe to accept: each phase
   boundary compares against the state at phase start, not a clean worktree,
   so only paths a phase itself changes are checked.

## Model gate

Ask once, after preflight and before the plan phase, how to choose the
subagent models. The inline planner always runs on the parent session's model
(set it with `/model` before `/pter`); this gate covers only the task writer,
the executor, and the reviewer. Offer three modes:

1. **Inherit**: every `Agent` spawn omits `model`; all subagents run on the
   parent session's model.
2. **Predefined**: apply this role-to-model table with no further questions.
   To change the preset, edit this table.

   | Role        | Model   |
   | ----------- | ------- |
   | Task writer | `opus`  |
   | Executor    | `opus`  |
   | Reviewer    | `fable` |

3. **Pick for this session**: ask one batched `AskUserQuestion` with three
   questions, one per role (task writer, executor, reviewer). Options for
   each role: inherit, `fable`, `opus`, `sonnet`; `haiku` is available through
   the free-text "Other" answer.

Phrase the picks as the current `Agent` tool model options: today's set is
`sonnet`, `opus`, `haiku`, and `fable`, but the installed Claude Code release
is authoritative. Store the resolved role-to-model answers; inherit means the
later `Agent` spawn omits `model`. A subagent continued with `SendMessage`
keeps its original model; only a fresh spawn applies a role's model.

## Phase 1: Plan (inline)

Rename the window to ` Planning`. Then load the `planner` skill inline with
the `Skill` tool, passing the user's `/pter` arguments as the request:

```
Skill({ skill: "planner", args: "<the user's /pter arguments, verbatim>" })
```

Run the planner interview with the user in this conversation. The interview
writes `.artifacts/<plan-name>/PLAN.md`. Store the exact `PLAN.md` path.

## Gate 1: Plan review

1. Read `PLAN.md`. Show the user the path, the goal, the non-goals, and the
   settled decisions in a short summary.
2. Ask the user to proceed to tasks or to give adjustment notes. Wait.
3. On adjustment notes, rerun the planner steps inline on the same `PLAN.md`,
   then return to step 1.

## Phase 2: Tasks

Rename the window to ` Tasking`. Snapshot `git status --porcelain`. Then
spawn the task writer with that role's model (omit `model` for inherit):

```
Agent({
  subagent_type: "general-purpose",
  description: "Convert PLAN.md to TASKS.md",
  model: "<task-writer model, omitted for inherit>",
  prompt: "Read ~/.claude/skills/plan-to-tasks/SKILL.md and follow it as your operating instructions. Do not call the Skill tool for it: the skill disables model invocation, and the direct read is the intended loading path. Resolve the skill's relative references against ~/.claude/skills/plan-to-tasks/. Convert <absolute PLAN.md path> into TASKS.md in the same directory. Do not change PLAN.md or any other file. Report the TASKS.md path as `TASKS: <absolute path>`, the task count, and any blocking assumptions."
})
```

When the result arrives, run `git status --porcelain` again and diff the
snapshot. Only `TASKS.md` may change. On a violation, follow the boundary
rule above.

## Gate 2: Task review

1. Read `TASKS.md`. Show the user the task IDs and titles, the suggested
   sequence, and any open questions the task writer raised.
2. Ask the user for a go. Wait. On change notes, snapshot git state,
   `SendMessage` the task writer with the notes, diff the snapshot after the
   result (only `TASKS.md` may change), and return to step 1.

## Phase 3: Execute

Rename the window to ` Executing`. Then spawn the executor with that
role's model (omit `model` for inherit):

```
Agent({
  subagent_type: "general-purpose",
  description: "Implement TASKS.md",
  model: "<executor model, omitted for inherit>",
  prompt: "Read ~/.claude/skills/execute/SKILL.md and follow it as your operating instructions. Do not call the Skill tool for it: the skill disables model invocation, and the direct read is the intended loading path. Resolve the skill's relative references against ~/.claude/skills/execute/. Implement <absolute TASKS.md path> against <absolute PLAN.md path>. Base ref: <base ref>. Do not commit. Mark each task checkbox in TASKS.md as soon as its acceptance checks pass. Final message: tasks completed with IDs, validation commands run with results, blockers or unchecked tasks."
})
```

There is no boundary check for this phase: `TASKS.md` governs its scope.

If the result reports a stall or unchecked tasks without a named blocker,
`SendMessage` the executor exactly once:

```
SendMessage({
  to: "<executor agent name>",
  message: "Continue from the first unchecked task in <TASKS.md path>. Do not commit. Report tasks completed, validation run, and blockers."
})
```

After that single continuation, report the outcome to the user, whatever it
is. Do not loop.

## Phase 4: Review

Rename the window to ` Reviewing`. Snapshot `git status --porcelain`. Then
spawn the reviewer with that role's model (omit `model` for inherit):

```
Agent({
  subagent_type: "general-purpose",
  description: "Review the implementation",
  model: "<reviewer model, omitted for inherit>",
  prompt: "Read ~/.claude/skills/execution-review/SKILL.md and follow it as your operating instructions. Do not call the Skill tool for it: the skill disables model invocation, and the direct read is the intended loading path. Resolve the skill's relative references against ~/.claude/skills/execution-review/. Base ref: <base ref>. PLAN.md: <absolute path>. TASKS.md: <absolute path>. Write the review to <same directory>/REVIEW.md and edit nothing else. Final message: verdict, findings count per severity, and the REVIEW.md path as `REVIEW: <absolute path>`."
})
```

When the result arrives, run `git status --porcelain` again and diff the
snapshot. Only `REVIEW.md` may change. On a violation, follow the boundary
rule above.

## Gate 3: Review result

1. Read `REVIEW.md`. Show the user the verdict and the findings grouped by
   severity (CRITICAL, HIGH, MEDIUM, INFO) with one line each.
2. Ask the user whether to run one fix pass for the CRITICAL and HIGH
   findings or to stop here. Wait.

## Phase 5: Fix pass (only after approval at Gate 3)

Rename the window to ` Executing`. `SendMessage` the executor with the
`REVIEW.md` path:

```
SendMessage({
  to: "<executor agent name>",
  message: "Fix the CRITICAL and HIGH findings in <absolute REVIEW.md path>. Keep TASKS.md checkboxes accurate. Do not commit. Report what changed and the validation run."
})
```

If the continuation fails, spawn a fresh executor with the artifact paths
and the base ref (the executor role's model applies again). Report the
result. Then run Gate 4; never re-review automatically.

## Gate 4: Re-review choice (after every approved fix pass)

Ask the user to choose exactly one:

- **Resume the previous reviewer**: rename the window to ` Reviewing`,
  snapshot git state, and `SendMessage` the stored reviewer (it keeps its
  original model): "Re-review the fixed implementation after the approved fix
  pass. Base ref: <base ref>. PLAN.md: <path>. TASKS.md: <path>. Previous
  REVIEW.md (optional input): <path>. Write the re-review to <same REVIEW.md
  path> and edit nothing else. Final message: verdict, findings count per
  severity, and the REVIEW.md path." Diff the snapshot after the result; only
  `REVIEW.md` may change.
- **Start a fresh reviewer**: rename the window to ` Reviewing` and run
  Phase 4 again with a fresh spawn (the reviewer role's model applies again).
  Tell it to judge the fixed implementation independently and to use the
  previous `REVIEW.md`, if any, only as optional context.
- **Stop without re-review**: launch no reviewer. Go to Done.

Wait for the answer. If no reviewer agent name is stored (for example the
reviewer never completed), say so and offer only the fresh and stop choices.

After either re-review result, run Gate 3 again with the new `REVIEW.md`. If
the user approves another fix pass, run Phase 5 and this gate again; never
loop without a fresh gate answer.

## Done

Rename the window to ` Workflow done`. Give the final summary:

- The three artifact paths: `PLAN.md`, `TASKS.md`, `REVIEW.md`.
- Validation run, taken from the executor and reviewer results.
- Unresolved findings: MEDIUM and INFO, plus anything not fixed.
- A reminder that nothing was committed. The user reviews and commits.
