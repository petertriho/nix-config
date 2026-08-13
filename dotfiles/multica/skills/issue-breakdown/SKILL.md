---
name: issue-breakdown
description: Convert a settled plan in a Multica issue into a concrete task checklist inside that issue's description. Use when asked to break down, slice, or prepare an existing issue for implementation. Requires an issue reference; appends or updates a "## Tasks" section without reopening the planning conversation.
---

# Issue Breakdown

Convert a settled plan carried in a Multica issue into executable tasks, added
to the same issue's description. The output should let the engineer agent
start work with clear scope, dependencies, and acceptance checks.

## Workflow

1. Locate and read the source issue.
   - Resolve the issue reference from the request (a workspace-keyed
     identifier like `ABC-12`, or a UUID), then read it:
     `multica issue get <id> --output json`.
   - Identify the goal, non-goals, assumptions, settled decisions, proposed
     approach, validation requirements, risks, and open questions in the
     description.

2. Check whether the issue is task-ready.
   - Convert only settled plans. If the description is still a rough idea or
     the user is still choosing between approaches, say so and point to the
     `issue-planner` skill instead.
   - If one missing detail blocks sequencing or task definition, ask exactly
     one question before producing tasks.
   - If a missing detail does not block execution, state it as an assumption
     inside the task summary and continue.

3. Preserve the plan's boundaries.
   - Do not add features, broaden scope, or re-litigate settled decisions.
   - Carry forward non-goals, risks, and constraints that an implementer must
     not reinterpret.
   - Keep unresolved questions visible when they affect sequencing or risk.

4. Slice the work into executable tasks.
   - Prefer outcome-oriented tasks that can be completed and verified
     independently, as vertical behavior slices.
   - Split at real handoff, risk, dependency, or validation boundaries; avoid
     turning every code edit into a separate task.
   - Do not split "write tests" and "write implementation" into separate
     horizontal tasks; the `issue-implement` skill owns the red-green-refactor
     loop during execution.
   - Split risky, irreversible, exploratory, or migration work into discovery,
     implementation, and validation tasks as needed.
   - Include dependencies only when a task truly cannot start without another.

5. Tie validation to the work.
   - Every implementation task needs an acceptance check observable through
     tests, review, files changed, behavior, logs, or metrics.
   - Prefer acceptance checks through public interfaces or user-visible
     outcomes rather than private implementation details.
   - Leave the final TDD decision to the `issue-implement` skill.

6. Write the tasks into the issue description.
   - Re-read the issue immediately before writing, then update with the
     current description plus your changes:

     ```sh
     multica issue get <id> --output json | jq -r '.description' > /tmp/desc.md
     # edit /tmp/desc.md: append or update the "## Tasks" section only
     multica issue update <id> --description-stdin < /tmp/desc.md
     ```

   - Append the `## Tasks` section after the plan sections. Never rewrite,
     reorder, or reformat the sections above it.
   - If a `## Tasks` section already exists, update it deliberately: preserve
     completed `- [x]` checkboxes and their task IDs, append new tasks with
     new IDs rather than renumbering, and remove a pending task only when the
     plan no longer needs it.

## Tasks Section Format

```markdown
## Tasks

One-paragraph task summary: the execution path, important sequencing logic,
and assumptions used.

- [ ] T1: <title>
  - Why: the plan decision or goal this serves.
  - Depends on: task IDs or None.
  - Scope: the exact work included.
  - Out of scope: nearby work intentionally excluded.
  - Acceptance: concrete checks that prove completion.

### Suggested Sequence

The recommended order. Mark tasks as parallel only when their dependencies
and touched areas make that safe.

### Validation Plan

The final test, review, or acceptance pass across the whole task set.

### Remaining Open Questions

Only questions that still affect sequencing, ownership, risk, or cost.
```

The `- [ ] Tn:` checkbox line is the task's canonical completion marker; the
engineer flips it to `- [x]` during implementation.

## Task Quality Rules

- Avoid vague tasks like "implement backend" or "update UI".
- Do not create tasks for non-goals.
- Do not hide decisions inside task titles; put them in Scope or Acceptance.
- Prefer fewer, clearer tasks over a checklist of micro-steps; expand only
  when risk, dependencies, or validation justify it.
- Use concrete repository paths, commands, schemas, and APIs from the plan
  when available.

## Boundaries

- Only touch the `## Tasks` section of the description; never edit files,
  change issue status, assign the issue, or create sub-issues.
- After updating, report in chat (or, when triggered by a comment, in a reply
  under that comment using `--parent`): the issue identifier, the number of
  tasks, and any blocking assumptions or open questions.
