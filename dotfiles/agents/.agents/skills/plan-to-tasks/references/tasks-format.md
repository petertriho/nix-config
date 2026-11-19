# TASKS.md Format

The `plan-to-tasks` skill writes `TASKS.md` in this format. The `planner`
skill uses it when it revises an existing `TASKS.md`, and it copies the
Tracking template into the Task Tracking section of each plan. An agent that
implements a plan creates `TASKS.md` from that section. Each `TASKS.md`
carries its own Tracking section, so an implementing agent needs no skill to
track its progress.

## Sections

Use these sections in this order:

1. Title: `# Tasks: <plan title>`.

2. Task Summary
   - One paragraph that describes the execution path, the important
     sequencing logic, and the assumptions that you used.

3. Tracking
   - Copy the Tracking template below without changes.

4. Tasks
   - Give each task a Markdown checkbox with a stable ID:
     `- [ ] T1: <title>`.
   - Use the checkbox line as the canonical state marker of the task. The
     Tracking section defines the states.
   - Under each checkbox task, include these fields:
      - `Why`: the decision or goal in the plan that this task serves.
      - `Depends on`: task IDs, or `None`.
      - `Scope`: the exact work that the task includes.
      - `Out of scope`: nearby work that the task intentionally excludes.
      - `Acceptance`: concrete checks that prove the task is complete.
   - Add these fields only when they apply:
      - `Blocked by`: the open question that the user must answer before an
        agent can claim the task.
      - `Supersedes`: the IDs of earlier tasks that this task replaces. Use it
        only on a task that a revision adds.

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

5. Suggested Sequence
   - The recommended order. Group tasks as parallel only when their
     dependencies and touched areas make parallel work safe.

6. Validation Plan
   - The final test, review, rollout, or acceptance pass across the whole task
     set.

7. Remaining Open Questions
   - Only the questions that still affect sequencing, ownership, risk, or
     cost.

## Tracking template

```markdown
## Tracking

More than one agent can work on these tasks at the same time. This file is
the only record of task state.

- A task is open (`- [ ]`), claimed (`- [~]`), or done (`- [x]`).
- Use the absolute path of this file, also from a git worktree. Do not copy
  this file.
- Use one agent name for all of your claims. Add a random suffix so that no
  other agent has the same name, for example `claude-7f3a`.
- Read this file again immediately before each edit. In each edit, change
  one task line or one task block with an exact-match replacement. Never
  rewrite the whole file.
- You can claim an open task only if all of these conditions are true:
  - It has no `Blocked by` field.
  - No later task lists it in `Supersedes`.
  - Each task in its `Depends on` is done. A task that a later task
    supersedes counts as done only when each superseding task is done.
- To claim a task, change `- [ ] T<n>:` to `- [~] T<n>:`, and add
  `(claimed by <agent> <UTC time>)` at the end of the line. Then read the
  line again. If it does not show your claim, choose a different task.
- Work only on the tasks that you claimed.
- Before you mark a task done, read this file again. If a later task
  supersedes your task, release your task and tell the user.
- When the acceptance checks of your task pass, change `- [~]` to `- [x]`.
  Replace your claim note with `(done by <agent> <UTC time>)`.
- If you stop before a task is done, release it: change `- [~]` back to
  `- [ ]`, and remove your claim note.
- Do not change the claim of another agent. Only the user can release a
  stale claim.
- If the user answers the question in a `Blocked by` field, change that
  field to `Resolved: <answer>` before you claim the task.
- If you can claim no task, stop. Report the tasks that are claimed, blocked,
  or waiting for dependencies.
```
