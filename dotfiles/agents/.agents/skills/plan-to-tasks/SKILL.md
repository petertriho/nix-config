---
name: plan-to-tasks
description: Convert a completed plan, planner output, PLAN.md, PRD, or implementation outline into concrete sequenced tasks. Use when the user asks to turn a plan into tasks, create TASKS.md, produce handoff tickets, build an execution backlog, or prepare agent/developer implementation work from an already-settled plan.
disable-model-invocation: true
---

# Plan To Tasks

Convert a settled plan into executable work without reopening the planning
conversation. The output should let a fresh agent or developer start work with
clear scope, dependencies, and acceptance checks.

## Workflow

1. Locate and read the source plan.
   - If the user named a file, read that file before producing tasks.
   - If the plan is only in the conversation, use the latest complete plan or
     planner output. Do not infer missing requirements from earlier brainstorms
     unless they were carried into the final plan.
   - Identify the goal, non-goals, assumptions, settled decisions, proposed
     approach, validation requirements, risks, open questions, and Handoff Notes.

2. Check whether the plan is task-ready.
   - Convert only settled plans. If the user is still shaping scope or asking
     which approach to take, use the planner skill instead.
   - If one missing detail blocks sequencing or task definition, ask exactly
     one question before producing tasks.
   - If a missing detail does not block execution, state it as an assumption
     and continue.

3. Preserve the plan's boundaries.
   - Do not add features, broaden scope, or re-litigate settled decisions while
     converting the plan.
   - Carry forward non-goals, risks, constraints, and decisions that a future
     executor must not reinterpret.
   - Keep unresolved questions visible when they affect sequencing, ownership,
     risk, or cost.

4. Slice the work into executable tasks.
   - Prefer outcome-oriented tasks that can be completed and verified
     independently.
   - Prefer vertical behavior slices that can be implemented and validated one
     behavior at a time.
   - Split work at real handoff, risk, dependency, or validation boundaries;
     avoid turning every code edit into a separate task.
   - Do not split "write tests" and "write implementation" into separate
     horizontal tasks solely for TDD; the implementation skill owns the
     red-green-refactor loop during execution.
   - Split risky, irreversible, exploratory, migration, or ambiguous work into
     discovery, implementation, and validation tasks as needed.
   - Include dependencies only when a task truly cannot start without another.

5. Tie validation to the work.
   - Every implementation task needs an acceptance check that can be observed
     through tests, review, files changed, behavior, logs, metrics, or rollout
     state.
   - When behavior is involved, prefer acceptance checks through public
     interfaces or user-visible outcomes rather than private implementation
     details.
   - Add explicit test, review, migration, rollout, monitoring, or cleanup tasks
     when the plan requires them.
   - For an explicit test-first handoff, include verified expected failures in
     the test-only task's `Acceptance`.
   - Make the corresponding implementation tasks depend on that handoff.
   - Do not require TDD for every task. Leave the final TDD decision to the
     implementation skill, which can skip or adapt TDD for docs, config,
     mechanical refactors, generated files, and discovery work.

6. Save or update the tasks.
   - Resolve `.artifacts/` from the project root, or the working directory
     if no project root exists.
   - Choose the destination in this order:
     1. For an explicit revision, use the identified task file's existing path.
     2. For a source `.artifacts/<plan-name>/PLAN.md`, use its sibling `TASKS.md`.
     3. Otherwise, choose a new destination:
        - Use `.artifacts/<plan-name>/TASKS.md` with a concise,
          goal-based kebab-case name.
        - If the directory exists, choose an unused suffix such as
          `-2`, `-3`, or a timestamp.
   - Do not infer a revision from matching goals or directory names.
   - If the selected task file exists, read its latest contents before editing.
   - For updates, unless the user explicitly requests replacement:
     - Preserve user-authored context and completed task IDs, checkboxes, scope,
       and acceptance criteria as history.
     - Compare the revised plan, including Handoff Notes, against existing
       tasks and dependencies.
     - For invalidated or expanded completed work:
       - Reuse a corrective task if it already covers the required change.
       - Otherwise, append an unchecked corrective task with a new ID.
     - Do not rewrite checked tasks to describe changed work.
     - In `Why`, identify the historical task IDs and acceptance criteria
       superseded by each correction.
     - Update pending dependencies and Suggested Sequence to wait for corrections
       where needed.
     - Add corrective tasks for completed dependents when their guarantees are
       also invalidated.
   - During replacement, redefined work must start unchecked.
   - Create the selected task directory only if needed.
   - Write the selected task file using Task Output Format.

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

## Task Quality Rules

- Avoid vague tasks like "implement backend" or "update UI".
- Do not create tasks for non-goals.
- Do not create planning tasks unless discovery is explicitly needed before
  implementation can start.
- Do not hide decisions inside task titles; put the decision in `Scope` or
  `Acceptance`.
- Do not create horizontal TDD batches such as "write all tests" followed by
  "implement all code" unless the plan explicitly requires that handoff.
- Prefer fewer, clearer tasks over a large checklist of micro-steps.
- Aim for a task set that is easy to review in one pass; expand only when risk,
  ownership, dependencies, or validation justify it.
- If the user asks for tickets, make each task independently assignable and
  include enough context to paste into an issue tracker.
- If the user asks for agent handoff, include enough context for a fresh agent
  to execute without rereading the entire planning conversation.
- Prefer concrete repository paths, commands, schemas, APIs, and affected
  components from the plan when available.
- Keep task IDs stable when updating an existing `TASKS.md`; append new IDs
  rather than renumbering completed work.
