---
name: execute
description: "Use this skill only when the user explicitly asks to modify files or carry out implementation work now, such as fixing a bug, adding a feature, making tests pass, refactoring code, or completing a specific task from an existing task list. It drives end-to-end implementation with a smallest-safe-diff bias: inspect context, prefer existing code and native capabilities, avoid speculative abstractions, validate, and report clearly. Do not use for planning, plan refinement, task breakdown, architecture review, code review, diagnosis, research, discussion of approaches, or interpreting a plan unless the user clearly asks to edit files now."
disable-model-invocation: true
---

# Execute

Implement direct requests, bug reports, issues, named files, or task-file work
end-to-end. A task file is optional.

## Defaults

- Before editing, inspect named files, nearby code, tests, docs, provided
  `.artifacts`, and useful recent commits.
- Preserve conventions, public APIs, validation commands, and repo workflow unless
  the user requests changes.
- Work autonomously when behavior is clear. Ask exactly one focused question only
  when an interface decision, risky migration, destructive action, or ambiguous
  acceptance criterion materially changes implementation.
- Do not commit unless explicitly asked.
- Never revert or overwrite others' changes in a shared worktree.

## Implementation Ladder

Choose the smallest correct change. Stop at the first safe rung:

1. Remove, rename, or connect existing code.
2. Use the language/runtime standard library.
3. Use native platform features: browser controls, CSS, database constraints,
   shell commands, framework conventions, or existing validation.
4. Use a fitting installed dependency.
5. Make a small local code change.
6. Add dependencies, abstractions, services, config surfaces, or scaffolding only
   when earlier rungs cannot meet the requirement cleanly.

Use the ladder as a quick decision aid, not a research project. Prefer deletion
when behavior is preserved, and better edge-case handling between similarly small
options. Minimal means less code to own, not fragile code.

Never remove trust-boundary validation, data-loss prevention, security controls,
accessibility basics, compatibility requirements, or explicitly protected behavior.
Document a shortcut's known ceiling and replacement condition in a brief comment
or completion note, not comments on obvious code.

## Inputs

- **Direct request:** understand current behavior and tests, then derive a short
  transient plan. Track progress internally or with the host's todo tool when useful.
  Do not create `.artifacts` or task artifacts unless asked.
- **Plan without implementation approval:** clarify scope, risks, or acceptance
  if asked, but wait for an explicit request to edit files.
- **Approved implementation plan:** read it and its referenced files. Implement
  directly when scope and acceptance are clear. Otherwise, ask whether to split
  a plan too broad or ambiguous for one safe pass.

### TASKS.md

1. Read the full task file and sibling `PLAN.md`, if present.
2. Record the IDs checked before this run.
   Retain this baseline across continuations. If unavailable, do not guess which checks belong to this run.
3. Identify pending tasks, dependencies, sequence, acceptance, validation notes,
   open questions, and non-goals.
4. Execute all unblocked pending tasks in suggested order, or only the user-selected subset.
5. After acceptance and relevant validation pass, check each task before starting
   the next. Never batch checkbox updates.
   Test-only handoffs also need the handoff evidence below before completion.

Preserve user-authored context and pre-run completion history.

### Later validation failures

If later validation disproves current task acceptance:

1. Pause work dependent on the invalidated guarantees.
2. Reset affected current-run checkboxes to `[ ]`, including dependents whose acceptance is invalidated.
3. Preserve pre-run completed checkboxes, scope, and acceptance as history.
4. Add a concise `Validation note` under each affected task: failing command,
   observed result, invalidated criterion, and blocked dependencies.
5. Repair within approved scope, or follow Blockers when a decision is needed.
6. After acceptance and relevant validation pass, recheck each reset task.
7. Mark its validation notes resolved.

Unresolved current-acceptance notes block dependents even when historical
checkboxes stay checked. Broad failures or skipped validation do not justify
clearing unrelated tasks. Approved plan corrections superseding acceptance are not
regressions. Test-only handoffs stay valid when implementation turns their tests green.

## TDD

Default to TDD for observable behavior through public interfaces: bugs,
regressions, APIs, CLI/UI behavior, integrations, business rules, complex logic,
and acceptance mentioning tests or testable behavior.

Skip or adapt TDD when a failing behavior test adds little value:

- Docs, copy, comments, formatting, or generated files.
- Config validated through build, eval, or startup checks.
- Mechanical renames or migrations with existing coverage.
- Pure discovery or diagnosis.
- Tiny one-line behavior changes already proved by nearby tests, typechecks,
  or smoke checks.

When skipping TDD, define concrete validation before editing. Keep tests
slice-sized and public-behavior-focused so internal refactors do not break them.
Non-trivial logic should retain a runnable regression check. Avoid broad fixtures,
private-helper tests, and speculative coverage.

### Vertical slices

Unless a settled plan requires the explicit handoff below, never write all tests
before production code. Bulk tests lock in imagined behavior.

1. Select the smallest observable behavior that advances the task.
2. Write one failing public-interface test.
3. Run the narrowest command proving failure for the expected reason.
4. Write the minimum production code to pass it.
5. Run the targeted test until it passes.
6. Repeat for the next behavior.
7. Refactor only after relevant tests are green.

### Explicit test-first handoffs

When the settled plan requires separate test-only delivery before implementation:

1. Write only agreed tests and necessary fixtures.
2. Verify failures demonstrate missing planned behavior, not setup errors or unrelated regressions.
3. Save concise, secret-redacted `Handoff evidence` under the task in `TASKS.md`:
   - Test paths and names.
   - Command, working directory, and observed exit status.
   - Expected versus observed failures and why they prove missing planned behavior.
   - Delivery stage: pre-implementation state and dependent task.
   Preserve this evidence after tests turn green. Without a task file, put it in
   the completion report instead, without creating unrequested task artifacts.
4. After test-only acceptance passes and evidence is recorded, check the task.
5. Report expected failures as handoff evidence, not green implementation.
6. In dependent implementation tasks, make delivered tests pass one behavior at a time.

Verified expected failures validate only the test-only task. Implementation
completion requires all planned behavior and final validation to pass.

## Subagents

Use supported subagents adaptively for complex, risky, multi-file, or unfamiliar
work. Keep simple tasks in the main agent.

Read each bundled prompt in `references/subagents/` before using its role,
including inline use, and apply its boundaries:

- `test-writer.md`: one public-behavior test with verified expected failure.
- `implementation-writer.md`: minimum production change for the current failing test.
- `refactor-reviewer.md`: review and cleanup only after tests are green.

If subagents are unavailable, follow these boundaries inline. For explicit
test-first handoffs, repeat the single-behavior test-writer role before
implementation roles. Otherwise, keep vertical slices.

Each handoff includes the task/behavior, relevant files and public interfaces,
non-goals and scope boundaries, exact validation command if known, and expected
output: test path/failure, implementation diff summary, or refactor review result.

## Blockers

If passing a valid implementation test needs scope, requirement, or public-interface changes:

1. Stop implementation.
2. Preserve the valid failing test without weakening or deleting it.
3. Leave the task incomplete.
4. Report attempts, blocker, and the user decision needed.

Correct tests that misunderstand existing public behavior, with an explanation,
but never lower acceptance criteria.

## Validation

Use targeted validation during red-green cycles and broader relevant validation
after each task or full run: suite, typecheck, lint, build, smoke test, documented
command, or manual acceptance check. For unavailable validation, report the
command and why it was skipped.

## Completion Report

Report concisely:

- Changes.
- TDD used or skipped, and why.
- Tests and validation commands run.
- Task checkboxes updated.
- Deliberate simplifications, omissions, and when to add them.
- Blockers, skipped validation, and residual risks.

Include speculative next steps only when they naturally follow from known blockers or failed validation.
