---
name: plan-to-tasks
description: Convert a completed plan, planner output, PLAN.md, PRD, or implementation outline into concrete sequenced tasks. Use when the user asks to turn a plan into tasks, create TASKS.md, produce handoff tickets, build an execution backlog, or prepare agent/developer implementation work from an already-settled plan.
disable-model-invocation: true
---

# Plan To Tasks

Convert settled plans into tasks a fresh agent or developer can execute without
reopening planning or rereading the conversation.

## Workflow

1. Read the named plan file, or the latest complete conversation plan or planner output.
   - Ignore earlier brainstorm requirements absent from the final plan.
   - Identify goals, non-goals, assumptions, decisions, approach, validation,
     risks, open questions, and Handoff Notes.

2. Check readiness.
   - If scope or approach is unsettled, use the planner skill instead.
   - If a missing detail blocks sequencing or task definition, ask exactly one
     question before producing tasks.
   - For nonblocking missing details, continue with explicit assumptions.

3. Preserve boundaries.
   - Do not add features, broaden scope, or reopen settled decisions.
   - Carry forward non-goals, risks, constraints, and decisions.
   - Keep questions affecting sequencing, ownership, risk, or cost visible.
   - Use concrete repository paths, commands, schemas, APIs, and components
     from the plan when available.

4. Define executable tasks.
   - Prefer fewer, clear outcome-oriented tasks that can be completed and
     verified independently, one vertical behavior slice at a time.
   - Aim for a task set that is easy to review in one pass.
   - Split at real handoff, risk, ownership, dependency, or validation boundaries,
     not individual code edits.
   - Separate discovery, implementation, and validation for risky, irreversible,
     exploratory, migration, or ambiguous work as needed.
   - Do not create tasks for non-goals.
   - Add planning tasks only when discovery is explicitly needed before implementation.
   - Add dependencies only when work cannot start without another task.
   - Use specific titles, not "implement backend" or "update UI".
   - Put decisions in `Scope` or `Acceptance`, not only titles.
   - For tickets, make each task independently assignable with enough context for an issue tracker.

5. Define validation.
   - Give every implementation task observable acceptance checks through tests,
     review, files changed, behavior, logs, metrics, or rollout state.
   - Prefer public interfaces or user-visible outcomes over private implementation details for behavior checks.
   - Include explicit test, review, migration, rollout, monitoring, or cleanup
     tasks when the plan requires them.
   - Leave TDD and red-green-refactor to the implementation skill, including
     skipping or adapting TDD for docs, config, mechanical refactors, generated files, and discovery.
   - Do not create horizontal test/implementation tasks solely for TDD unless
     the plan explicitly requires that handoff.
   - For explicit test-first handoffs, include verified expected failures in the test-only task's `Acceptance`.
   - Make corresponding implementation tasks depend on that handoff.

## Saving and Revisions

Resolve `.artifacts/` from the project root, or the working directory if no
project root exists. Choose the destination in this order:

1. Explicit revision: the identified task file's existing path.
2. Source `.artifacts/<plan-name>/PLAN.md`: its sibling `TASKS.md`.
3. Otherwise: `.artifacts/<plan-name>/TASKS.md` with a concise, goal-based kebab-case name.
   If the directory exists, choose an unused suffix such as `-2`, `-3`, or a timestamp.

Do not infer revisions from matching goals or directory names.
Read the selected task file's latest contents before editing, if it exists.
Keep existing task IDs stable when updating.
Append new IDs rather than renumbering completed work.

For updates, unless the user explicitly requests replacement:

- Preserve user-authored context and completed task IDs, checkboxes, scope, and acceptance as history.
- Preserve recorded validation and handoff notes when revising tasks.
- Compare the revised plan, including Handoff Notes, against existing tasks and dependencies.
- For invalidated or expanded completed work, reuse a corrective task that covers the change.
  Otherwise, append an unchecked corrective task with a new ID.
- Do not rewrite checked tasks to describe changed work.
- In each correction's `Why`, identify the historical task IDs and acceptance criteria it supersedes.
- Update affected pending dependencies and Suggested Sequence to wait for corrections.
- Add corrective tasks for completed dependents whose guarantees are also invalidated.

During replacement, redefined work must start unchecked.
Create the selected directory only if needed.
Write `TASKS.md` using the format below.

## Task Output Format

Use these sections in the selected `TASKS.md`:

1. Task Summary
   - One paragraph describing the execution path, important sequencing logic,
     and assumptions used.

2. Tasks
   - Use Markdown task checkboxes with stable IDs: `- [ ] T1: <title>`.
   - Keep the checkbox line as the task's canonical completion marker, so it
     can be changed to `- [x]` during implementation.
   - Under each checkbox task include:
      - `Why`: the planner decision or goal this serves.
      - `Depends on`: task IDs or `None`.
      - `Scope`: the exact work included.
      - `Out of scope`: nearby work intentionally excluded.
      - `Acceptance`: concrete checks that prove completion.

   Example:

   ```markdown
   - [ ] T1: Add schema validation for imported records
     - Why: The plan requires rejecting malformed imports before persistence.
     - Depends on: None
     - Scope: Add validation at the import boundary and return actionable
       errors for missing required fields.
     - Out of scope: UI copy changes and bulk import performance tuning.
     - Acceptance: Unit tests cover valid records, missing required fields, and
       invalid field types; malformed records are not persisted.
   ```

3. Suggested Sequence
   - The recommended order. Group tasks as parallel only when their
     dependencies and touched areas make parallel work safe.

4. Validation Plan
   - The final test, review, rollout, or acceptance pass across the whole task
     set.

5. Remaining Open Questions
   - Only questions that still affect sequencing, ownership, risk, or cost.

After writing or updating `TASKS.md`, summarize the file path and any blocking
assumptions or open questions in the final response.
