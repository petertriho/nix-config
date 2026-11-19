---
name: plan-to-tasks
description: Convert a completed plan, planner output, PLAN.md, PRD, or implementation outline into concrete sequenced tasks. Use when the user asks to turn a plan into tasks, create TASKS.md, produce handoff tickets, build an execution backlog, or prepare agent/developer implementation work from an already-settled plan.
disable-model-invocation: true
---

# Plan To Tasks

Convert a settled plan into tasks that a fresh agent or developer can
execute. They must not need to reopen planning or reread the conversation.

## Workflow

1. Read the plan.
   - If the user names a plan file, read that file. Otherwise, read the
     latest complete plan or planner output in the conversation.
   - Ignore requirements from earlier brainstorms that are not in the final
     plan.
   - Do not make tasks from the Task Tracking section of a plan. It describes
     how agents track the tasks, not work to do.
   - Identify the goals, non-goals, assumptions, decisions, approach,
     validation, risks, open questions, and Handoff Notes.

2. Decide whether the plan is ready.
   - If the scope or the approach is not settled, use the planner skill
     instead.
   - If a missing detail blocks sequencing or task definition, ask exactly
     one question before you write tasks.
   - If a missing detail is nonblocking, continue with an explicit
     assumption.

3. Keep the boundaries of the plan.
   - Do not add features, broaden the scope, or reopen settled decisions.
   - Carry the non-goals, risks, constraints, and decisions of the plan into
     the tasks.
   - Keep each question that affects sequencing, ownership, risk, or cost
     visible.
   - When the plan gives concrete repository paths, commands, schemas, APIs,
     or components, use them.

4. Define executable tasks.
   - Prefer fewer, clear tasks, each defined by its outcome.
   - Prefer tasks that can be completed and verified independently, each with
     one vertical slice of behavior.
   - Make the task set easy to review in one pass.
   - Split tasks at real boundaries of handoff, risk, ownership, dependency,
     or validation. Do not split at individual code edits.
   - For risky, irreversible, exploratory, migration, or ambiguous work, you
     can put discovery, implementation, and validation in separate tasks.
   - Do not create tasks for non-goals.
   - Add a planning task only when discovery is explicitly needed before
     implementation.
   - Add a dependency only when a task cannot start until another task is
     complete.
   - Use specific titles, not "implement backend" or "update UI".
   - Put each decision in `Scope` or `Acceptance`, not only in the title.
   - If the user asks for tickets, make each task independently assignable.
     Give each task enough context for an issue tracker.

5. Define validation.
   - Give every implementation task observable acceptance checks. Use tests,
     review, changed files, behavior, logs, metrics, or rollout state.
   - For behavior checks, prefer public interfaces or user-visible outcomes
     to private implementation details.
   - When the plan requires test, review, migration, rollout, monitoring, or
     cleanup tasks, include those tasks explicitly.
   - Leave TDD and red-green-refactor to the implementation skill. That skill
     also decides when to skip or adapt TDD for docs, config, mechanical
     refactors, generated files, and discovery.
   - Unless the plan explicitly requires a test-first handoff, do not create
     horizontal test and implementation tasks only for TDD.
   - If the plan explicitly requires a test-first handoff:
     - Put verified expected failures in the `Acceptance` of the test-only
       task.
     - Make the corresponding implementation tasks depend on the test-only
       task.

## Saving and Revisions

Use the `.artifacts/` directory in the project root. If there is no project
root, use the working directory.

Choose the path of the task file in this order:

1. If the user explicitly asks you to revise an identified task file, use the
   existing path of that file.
2. If the source plan is `.artifacts/<plan-name>/PLAN.md`, use its sibling
   `TASKS.md`.
3. Otherwise, use `.artifacts/<plan-name>/TASKS.md`. Use a short kebab-case
   `<plan-name>` that describes the goal. If that directory exists, add an
   unused suffix such as `-2`, `-3`, or a timestamp.

Do not infer a revision from a matching goal or directory name.

If the selected task file exists, read its latest contents before you edit
it.

If every task in the existing file is open (`- [ ]`), no agent has started
work. This is the usual state of a new file. Replace its tasks with the
tasks of this conversion, and keep the context that the user wrote. Read the
file again immediately before you replace it. If a task is now claimed or
done, use the rules below instead.

Otherwise, other agents can be working on the file at the same time. Read it
again immediately before each edit. Change only the task blocks and sections
that you must change, and never rewrite the whole file. When you update the
file:

- Keep the existing task IDs stable.
- Append new task IDs. Do not renumber completed tasks.
- Do not change a claimed task (`- [~]`). Treat it like a completed task.

A completed task has a checked box (`- [x]`). Unless the user explicitly asks
for a replacement, also obey these rules:

- Keep the context that the user wrote.
- Keep the IDs, checkboxes, scope, and acceptance of completed tasks as
  history.
- Keep the recorded validation and handoff notes.
- Compare the revised plan, including its Handoff Notes, with the existing
  tasks and dependencies.
- If the revised plan invalidates or expands the work of a completed task:
  - If an existing corrective task covers the change, reuse that task.
  - Otherwise, append an unchecked corrective task with a new ID.
- Do not rewrite a completed task to describe the changed work.
- In the `Why` of each corrective task, name the historical task IDs and
  acceptance criteria that it supersedes. List the same IDs in its
  `Supersedes` field.
- Update the dependencies of affected open tasks, and the Suggested
  Sequence, so that they wait for the corrective tasks.
- If the change also invalidates the guarantees of a completed dependent
  task, add a corrective task for that task too.

In a replacement, every redefined task must start open (`- [ ]`).

Create the selected directory only if it does not exist. Write the task file
in the Task Output Format.

## Task Output Format

Use the format in [references/tasks-format.md](references/tasks-format.md).
Copy its Tracking template without changes. If an existing task file has no
Tracking section, add the template above the first task.

After you write or update `TASKS.md`, report its file path in the final
response. Also report any blocking assumptions or open questions.
