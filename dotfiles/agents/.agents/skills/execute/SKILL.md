---
name: execute
description: "Use this skill only when the user explicitly asks to modify files or carry out implementation work now, such as fixing a bug, adding a feature, making tests pass, refactoring code, or completing a specific task from an existing task list. It drives end-to-end implementation with a smallest-safe-diff bias: inspect context, prefer existing code and native capabilities, avoid speculative abstractions, validate, and report clearly. Do not use for planning, plan refinement, task breakdown, architecture review, code review, diagnosis, research, discussion of approaches, or interpreting a plan unless the user clearly asks to edit files now."
disable-model-invocation: true
---

# Execute

Implement a direct request, a bug report, an issue, a change to named files,
or the tasks in a task file. Complete the work from start to finish. A task
file is optional.

## Defaults

- Before you edit, inspect the named files, nearby code, tests, docs, any
  provided `.artifacts`, and useful recent commits.
- Unless the user asks for a change, keep the conventions, public APIs,
  validation commands, and workflow of the repository.
- If the expected behavior is clear, work autonomously.
- Ask exactly one focused question only when one of these items changes the
  implementation materially:
  - An interface decision.
  - A risky migration.
  - A destructive action.
  - An ambiguous acceptance criterion.
- Do not commit unless the user explicitly asks.
- In a shared worktree, never revert or overwrite changes that you did not
  make.

## Implementation Ladder

Choose the smallest correct change. Stop at the first rung that meets the
requirement safely:

1. Remove, rename, or connect existing code.
2. Use the standard library of the language or runtime.
3. Use a native platform feature, such as browser controls, CSS, database
   constraints, shell commands, framework conventions, or existing input
   validation.
4. Use a suitable installed dependency.
5. Make a small local code change.
6. If no earlier rung meets the requirement cleanly, add a dependency, an
   abstraction, a service, a config surface, or scaffolding.

Use the ladder as a quick decision aid, not as a research project.

- If a deletion preserves the behavior, prefer the deletion.
- If two options are almost the same size, prefer the option with better
  edge-case handling.

Minimal means less code to maintain, not fragile code.

Never remove these items:

- Input validation at a trust boundary.
- Data-loss prevention.
- Security controls.
- Basic accessibility.
- Compatibility requirements.
- Behavior that is explicitly protected.

If you take a shortcut, record its known limit and when to replace it. Use a
brief comment or the completion report. Do not comment obvious code.

Never refer to uncommitted planning artifacts in code or comments:
`.artifacts`, `PLAN.md`, `TASKS.md`, task IDs, or handoff evidence. They are
not committed, so the reference points to nothing. Keep each comment
self-contained. Put any artifact reference in the completion report.

## Inputs

- **Direct request:** Understand the current behavior and its tests. Then
  make a short plan, and do not save it. When it helps, track progress
  internally or with the todo tool of the host. Do not create `.artifacts`
  or task artifacts unless the user asks.
- **Plan without implementation approval:** If the user asks, clarify the
  scope, risks, or acceptance criteria. Do not edit files until the user
  explicitly asks for edits.
- **Approved implementation plan:** Read the plan and the files that it
  refers to. If the scope and the acceptance criteria are clear, implement
  the plan directly. If the plan is too broad or ambiguous for one safe pass,
  ask the user whether to split it.

### TASKS.md

To check a task, set its checkbox to `[x]`. To uncheck a task, set it to
`[ ]`. Baseline tasks are the tasks that were checked before this run.

1. Read the full task file, and the sibling `PLAN.md` if it exists.
2. Record the IDs of the baseline tasks, and keep this record across
   continuations. If the record is not available, do not guess which checked
   tasks belong to this run.
3. Identify the pending tasks, dependencies, sequence, acceptance criteria,
   `Validation note` entries, open questions, and non-goals.
4. Implement the unblocked pending tasks in the suggested order. If the user
   selected some tasks, implement only those.
5. Check each task after its acceptance criteria and relevant validation
   pass, and before you start the next task. Never batch checkbox updates. A
   test-only handoff task also needs its `Handoff evidence` before you check
   it.

Keep the context that the user wrote and the completion history of the
baseline tasks.

### Later validation failures

If later validation shows that a task no longer meets its current acceptance
criteria:

1. Pause the work that depends on the invalidated guarantees.
2. Uncheck each affected task that this run checked, including dependent
   tasks whose acceptance criteria are now invalid.
3. Do not uncheck baseline tasks. Keep their checkboxes, scope, and
   acceptance criteria as history.
4. Under each affected task, add a concise `Validation note` with these
   items:
   - The failing command.
   - The observed result.
   - The invalidated criterion.
   - The blocked dependent tasks.
5. Repair the failure within the approved scope. If the repair needs a
   decision, follow Blockers.
6. After the acceptance criteria and relevant validation pass again, check
   each task that you unchecked.
7. Mark the `Validation note` of each repaired task as resolved.

An unresolved `Validation note` about current acceptance criteria blocks
dependent tasks, even when the affected task is a checked baseline task.

Do not uncheck unrelated tasks because of a broad failure or skipped
validation. An approved plan correction that supersedes acceptance criteria
is not a regression. A test-only handoff task stays valid when the
implementation makes its tests pass.

## TDD

Use TDD by default for observable behavior through a public interface. This
includes bugs, regressions, APIs, CLI and UI behavior, integrations, business
rules, complex logic, and acceptance criteria that mention tests or testable
behavior.

Skip or adapt TDD when a failing behavior test adds little value:

- Docs, copy, comments, formatting, or generated files.
- Config that a build, eval, or startup check validates.
- Mechanical renames or migrations with existing coverage.
- Pure discovery or diagnosis.
- Tiny one-line behavior changes that nearby tests, typechecks, or smoke
  checks already prove.

If you skip TDD, define concrete validation before you edit.

Keep each test slice-sized and focused on public behavior, so that internal
refactors do not break it. For non-trivial logic, keep a runnable regression
check. Avoid broad fixtures, tests of private helpers, and speculative
coverage.

### Vertical slices

Unless a settled plan requires the explicit handoff below, never write all
tests before the production code. Tests written in bulk lock in imagined
behavior.

1. Select the smallest observable behavior that advances the task.
2. Write one failing test through a public interface.
3. Run the narrowest command that shows that the test fails for the expected
   reason.
4. Write the minimum production code that makes the test pass.
5. Run the targeted test until it passes.
6. Repeat for the next behavior.
7. Refactor only after the relevant tests pass.

### Explicit test-first handoffs

When the settled plan requires a separate test-only delivery before the
implementation:

1. Write only the agreed tests and the necessary fixtures.
2. Verify that the failures show missing planned behavior. They must not come
   from setup errors or unrelated regressions.
3. Under the task in `TASKS.md`, save concise `Handoff evidence`. Redact all
   secrets. Include these items:
   - The test paths and names.
   - The command, the working directory, and the observed exit status.
   - The expected and observed failures, and why they prove that the planned
     behavior is missing.
   - The delivery stage: the pre-implementation state and the dependent task.

   Keep this evidence after the tests pass. If there is no task file, put the
   evidence in the completion report. Do not create task artifacts that the
   user did not ask for.
4. After the acceptance criteria of the test-only task pass and the evidence
   is recorded, check the task.
5. Report the expected failures as handoff evidence, not as a passing
   implementation.
6. In the dependent implementation tasks, make the delivered tests pass one
   behavior at a time.

Verified expected failures validate only the test-only task. The
implementation is complete only when all planned behavior works and the final
validation passes.

## Subagents

If the host supports subagents, use them for complex, risky, multi-file, or
unfamiliar work. Keep simple tasks in the main agent.

Before you use a role, read its bundled prompt in `references/subagents/`,
also when you do the role inline. Obey the boundaries in the prompt.

- `test-writer.md`: one public-interface test with a verified expected
  failure.
- `implementation-writer.md`: the minimum production change for the current
  failing test.
- `refactor-reviewer.md`: review and cleanup, only after the tests pass.

If subagents are not available, obey these boundaries inline. For an explicit
test-first handoff, repeat the test-writer role for each behavior before any
implementation role. Otherwise, keep to vertical slices.

Give each subagent this information:

- The task or behavior.
- The relevant files and public interfaces.
- The non-goals and scope boundaries.
- The exact validation command, if you know it.
- The expected output: a test path and failure, a summary of the
  implementation diff, or a refactor review result.

## Blockers

If a valid implementation test can pass only with a change to the scope, a
requirement, or a public interface:

1. Stop the implementation.
2. Keep the valid failing test. Do not weaken or delete it.
3. Leave the task incomplete and unchecked.
4. Report what you tried, the blocker, and the decision that the user must
   make.

If a test misunderstands existing public behavior, correct the test and
explain the correction. Never lower the acceptance criteria.

## Validation

During red-green cycles, use targeted validation. After each task or after
the full run, use broader relevant validation. Examples are the test suite, a
typecheck, lint, a build, a smoke test, a documented command, or a manual
acceptance check.

If a validation is not available, report the command and why you skipped it.

## Completion Report

Write a concise report with these items:

- The changes.
- Whether you used or skipped TDD, and why.
- The tests and validation commands that you ran, and their results.
- The task checkboxes that you updated.
- Deliberate simplifications and omissions, and when to add them.
- Blockers, skipped validation, and remaining risks.

Include speculative next steps only when they follow directly from known
blockers or failed validation.
