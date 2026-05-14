---
name: plan-to-tasks
description: Break a completed planner skill output into concrete, sequenced implementation tasks. Use when the user provides a final plan, asks to turn a plan into tasks, wants agent/developer handoff tickets, or needs an execution backlog derived from a planner output.
---

## Workflow

1. Read the full plan first.
   - Identify the goal, non-goals, settled decisions, proposed approach,
     validation requirements, risks, and open questions.
   - Preserve the planner's scope boundaries. Do not add features or broaden
     the plan while converting it into tasks.

2. Resolve blockers minimally.
   - If an open question blocks sequencing or task definition, ask exactly one
     question before producing tasks.
   - If the missing detail can be represented as an assumption, state it and
     continue.

3. Convert the implementation plan into executable slices.
   - Prefer small tasks that can be completed and verified independently.
   - Keep each task outcome-oriented, not activity-oriented.
   - Include dependencies only when a task truly cannot start without another.
   - Split risky, irreversible, or ambiguous work into discovery, change, and
     validation tasks.

4. Tie validation to tasks.
   - Every implementation task should include an acceptance check.
   - Add explicit test, review, migration, rollout, or monitoring tasks when
     the plan requires them.

5. Preserve handoff context.
   - Carry forward relevant decisions, risks, non-goals, and assumptions.
   - Highlight anything a future agent or developer must not reinterpret.

6. Save the tasks.
   - Use the existing `.changes/<plan-name>/` directory when the source plan
     came from `.changes/<plan-name>/PLAN.md`.
   - Otherwise choose a concise kebab-case `<plan-name>` based on the plan
     goal.
   - Write the final tasks to `.changes/<plan-name>/TASKS.md`.
   - Create `.changes/<plan-name>/` if it does not already exist.

## Task Output Format

Output tasks using these sections in this order:

1. Task Summary
   - One paragraph describing the execution path and any assumptions used.

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

3. Suggested Sequence
   - The recommended order, grouped only when parallel work is safe.

4. Validation Plan
   - The final test, review, or acceptance pass across the whole task set.

5. Remaining Open Questions
   - Only questions that still affect sequencing, ownership, risk, or cost.

## Task Quality Rules

- Avoid vague tasks like "implement backend" or "update UI".
- Do not create tasks for non-goals.
- Do not hide decisions inside task titles; put the decision in `Scope` or
  `Acceptance`.
- Prefer fewer, clearer tasks over a large checklist of micro-steps.
- If the user asks for tickets, make each task independently assignable.
- If the user asks for agent handoff, include enough context for a fresh agent
  to execute without rereading the entire planning conversation.
