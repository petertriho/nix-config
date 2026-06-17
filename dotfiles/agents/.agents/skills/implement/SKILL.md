---
name: implement
description: Use this skill only when the user explicitly asks to modify files or carry out implementation work now, such as fixing a bug, adding a feature, making tests pass, refactoring code, or completing a specific task from an existing task list. It drives end-to-end implementation with a smallest-safe-diff bias: inspect context, prefer existing code and native capabilities, avoid speculative abstractions, validate, and report clearly. Do not use for planning, plan refinement, task breakdown, architecture review, code review, diagnosis, research, discussion of approaches, or interpreting a plan unless the user clearly asks to edit files now.
disable-model-invocation: true
---

# Implement

Execute implementation work end-to-end. Inputs may be a direct request, bug
report, issue description, named files, or a specific task from a task file. A
task file is helpful but never required.

## Core Defaults

- Inspect project context before editing. Read named files, nearby code, tests,
  docs, recent commits when useful, and any provided `.artifacts` artifacts.
- Prefer the smallest correct change that satisfies the requested behavior.
- Deletion beats addition when it preserves required behavior. Avoid scaffolding,
  new dependencies, new config surfaces, and new abstractions unless the current
  task actually needs them.
- Preserve existing conventions, public APIs, validation commands, and repo
  workflow unless the user asks to change them.
- Work autonomously once the behavior is clear. Ask exactly one focused question
  only when an interface decision, risky migration, destructive action, or
  ambiguous acceptance criterion materially changes the implementation.
- Do not commit changes unless the user explicitly asks.
- In a shared worktree, never revert or overwrite changes you did not make.

## Implementation Ladder

Before adding new code, stop at the first rung that satisfies the task safely:

1. Remove, rename, or connect existing code instead of creating more code.
2. Use the language/runtime standard library.
3. Use native platform features such as browser controls, CSS, database
   constraints, shell commands, framework conventions, or existing validation.
4. Use an already-installed dependency when it clearly fits.
5. Add the smallest local code change.
6. Add a new dependency, abstraction, service, config surface, or generated
   scaffold only when the earlier rungs cannot meet the requirement cleanly.

The ladder is a quick decision aid, not a research project. If two approaches
are similarly small, choose the one with better edge-case behavior. Minimal
means less code to own, not fragile code.

Never simplify away input validation at trust boundaries, error handling that
prevents data loss, security controls, accessibility basics, compatibility
requirements, or anything the user explicitly asked to preserve.

If a deliberate shortcut has a known ceiling, make that ceiling visible with a
brief code comment or completion-note, including when to replace it. Do not
comment obvious code just to justify being concise.

## Input Handling

### Direct Requests

When the user asks for an implementation without a task file:

1. Read enough code to understand the current behavior and test setup.
2. Derive a short transient execution plan.
3. Track progress internally or with the host's todo tool when useful.
4. Do not create `.artifacts` files or task artifacts unless the user asks.

### Plans

When the user provides a plan without an explicit request to implement it:

1. Do not treat the plan as implementation approval.
2. Help clarify scope, risks, or acceptance criteria if asked.
3. Wait for a clear request to edit files before starting implementation work.

When the user explicitly asks to implement a plan:

1. Read the plan and any files it references.
2. Implement directly if the scope and acceptance criteria are clear.
3. If the plan is too broad or ambiguous to execute safely in one implementation
   pass, ask the user whether to split it first.

### TASKS.md

When the user provides `TASKS.md`:

1. Read the full task file and the sibling `PLAN.md` if it exists.
2. Identify pending tasks, dependencies, suggested sequence, acceptance checks,
   open questions, and non-goals.
3. Execute all unblocked pending tasks in suggested order unless the user names a
   narrower subset.
4. Mark a checkbox complete only after its acceptance checks and relevant
   validation pass.
5. Preserve completed checkboxes and user-authored context.

## TDD Decision Rule

Use test-driven development when the change affects observable behavior that can
be exercised through a public interface. Default to TDD for:

- Bug fixes and regressions.
- Public APIs, CLI commands, UI behavior, integrations, and business rules.
- Complex logic where examples clarify expected behavior.
- Any task where acceptance criteria mention tests or testable behavior.

Skip or adapt TDD when a failing behavior test would be artificial or low value:

- Docs-only, copy-only, or comment-only changes.
- Config-only changes where validation is a build, eval, or startup check.
- Formatting-only changes.
- Generated-file updates.
- Mechanical renames or migrations with existing test coverage.
- Pure discovery or diagnosis tasks.
- Tiny one-line behavior changes where nearby existing tests, typechecks, or a
  smoke check already prove the behavior and a new test would be ceremony.

When TDD is skipped, still define concrete validation before editing.

Keep tests as small as the implementation slice. Non-trivial logic should leave
behind one runnable check that fails if the behavior regresses; avoid broad
fixture suites, private-helper tests, or speculative coverage for behavior not
being implemented now.

## TDD Workflow

Execute vertical slices. Do not write all tests first and then all production
code; bulk test-writing locks in imagined behavior and creates brittle tests.

For each behavior:

1. Select the smallest observable behavior that moves the task forward.
2. Write one failing test through a public interface.
3. Run the narrowest command that proves the test fails for the expected reason.
4. Write the minimum production code needed to pass that test.
5. Run the targeted test until it passes.
6. Repeat for the next behavior.
7. Refactor only after the relevant tests are green.
8. Run broader validation at the end of the task or full run.

Good tests verify behavior, not private implementation details. They should
survive internal refactors that keep behavior unchanged.

## Optional Subagent Orchestration

Use subagents adaptively when the host supports them and the work is complex,
risky, multi-file, or unfamiliar. Keep simple tasks in the main agent to avoid
coordination overhead.

Bundled role prompts live in `references/subagents/`:

- `test-writer.md`: writes one failing behavior test and proves it fails for the
  expected reason.
- `implementation-writer.md`: makes the current failing test pass with the
  minimum production change.
- `refactor-reviewer.md`: reviews and cleans up only after tests are green.

Before using a subagent role or following it inline, read the corresponding
bundled prompt and apply its boundaries.

If subagents are unavailable, follow the same role boundaries inline. Never let a
test-writing phase become a horizontal all-tests-first batch.

### Subagent Handoff Contract

Each subagent handoff should include:

- The current task or behavior.
- Relevant files and public interfaces.
- Non-goals and scope boundaries.
- The exact validation command to run, if known.
- The expected output: test path and failure, implementation diff summary, or
  refactor review result.

## Blockers

If a valid failing test cannot be made green without changing scope,
requirements, or public interface:

1. Stop the implementation loop.
2. Preserve the failing test if it accurately captures desired behavior.
3. Do not weaken or delete the test just to get green.
4. Do not mark the task complete.
5. Summarize what was tried, the blocker, and the decision needed from the user.

If the test itself is wrong because it misunderstands existing public behavior,
fix the test and explain why. Do not use this as a loophole to lower acceptance
criteria.

## Validation

Use a two-level validation cadence:

1. Targeted validation during each red-green cycle.
2. Broader relevant validation after each completed task or full run.

Broader validation may be a package test suite, typecheck, lint, build, smoke
test, documented command, or manual acceptance check. If validation cannot be
run, report the command that should be run and why it was skipped.

## Completion Report

End with a concise report containing:

- What changed.
- Whether TDD was used or skipped, and why.
- Tests and validation commands run.
- Any task checkboxes updated.
- Any deliberate simplifications, what was skipped, and when to add it.
- Blockers, skipped validation, or residual risks.

Do not include speculative next steps unless they naturally follow from a known
blocker or failed validation.
