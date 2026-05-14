---
name: plan-to-tasks
description: Convert a completed plan, planner output, PLAN.md, PRD, or implementation outline into concrete sequenced tasks. Use when the user asks to turn a plan into tasks, create TASKS.md, produce handoff tickets, build an execution backlog, or prepare agent/developer implementation work from an already-settled plan.
---

# Plan To Tasks

Convert a settled plan into executable work without reopening the planning
conversation. The output should let a fresh agent or developer start work with
clear scope, dependencies, and acceptance checks.

## Workflow

1. Locate and read the source plan.
   - If the user named a file, read that file before producing tasks.
   - If the source is `.changes/<plan-name>/PLAN.md`, use the same
     `.changes/<plan-name>/` directory for the task file.
   - If the plan is only in the conversation, use the latest complete plan or
     planner output. Do not infer missing requirements from earlier brainstorms
     unless they were carried into the final plan.
   - Identify the goal, non-goals, assumptions, settled decisions, proposed
     approach, validation requirements, risks, and open questions.

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
     implementer must not reinterpret.
   - Keep unresolved questions visible when they affect sequencing, ownership,
     risk, or cost.

4. Slice the work into executable tasks.
   - Prefer outcome-oriented tasks that can be completed and verified
     independently.
   - Split work at real handoff, risk, dependency, or validation boundaries;
     avoid turning every code edit into a separate task.
   - Split risky, irreversible, exploratory, migration, or ambiguous work into
     discovery, implementation, and validation tasks as needed.
   - Include dependencies only when a task truly cannot start without another.

5. Tie validation to the work.
   - Every implementation task needs an acceptance check that can be observed
     through tests, review, files changed, behavior, logs, metrics, or rollout
     state.
   - Add explicit test, review, migration, rollout, monitoring, or cleanup tasks
     when the plan requires them.

6. Save or update the tasks.
   - Write the final tasks to `.changes/<plan-name>/TASKS.md`.
   - Create `.changes/<plan-name>/` if it does not already exist.
   - If `TASKS.md` already exists, read it first and update it deliberately;
     preserve completed checkboxes and user-authored context unless the user
     explicitly asked for replacement.
   - If no `.changes/<plan-name>/PLAN.md` exists, choose a concise kebab-case
     `<plan-name>` based on the plan goal.

## Task Output Format

Use these sections in `.changes/<plan-name>/TASKS.md`:

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
