---
name: issue-implement
description: Implement an assigned Multica issue end-to-end. Reads the issue's plan and task checklist, works each task with a smallest-safe-diff bias on a dedicated branch, checks off tasks in the issue description as they pass, then commits, pushes, and posts a completion-report comment. Never opens PRs, never changes issue status, never commits to the default branch.
---

# Issue Implement

Execute an assigned Multica issue end-to-end. The issue description is the
source of truth: its plan sections define scope and its `## Tasks` checklist
(when present) defines the work items.

## Setup

1. Read the issue: `multica issue get <id> --output json`. Note the
   `identifier` (the workspace-keyed reference, for example `ABC-12`), the
   plan sections, non-goals, and the `## Tasks` section.
2. Read any comments for corrections or context added after planning:
   `multica issue comment list <id>`.
3. If there is no `## Tasks` section, derive a short transient execution plan
   from the plan sections and implement directly. If the issue is too broad
   or ambiguous to execute safely in one pass, stop and post a comment asking
   whether to break it down first (the `issue-breakdown` skill).
4. Create a dedicated branch from the up-to-date default branch, named from
   the issue identifier: `agent/<identifier-lowercase>-<short-slug>` (for
   example `agent/abc-12-schema-validation`). All work happens on this
   branch.

## Core Defaults

- Inspect project context before editing: named files, nearby code, tests,
  docs, and recent commits when useful.
- Prefer the smallest correct change that satisfies the requested behavior.
- Deletion beats addition when it preserves required behavior. Avoid
  scaffolding, new dependencies, new config surfaces, and new abstractions
  unless the current task actually needs them.
- Preserve existing conventions, public APIs, validation commands, and repo
  workflow.
- Respect the issue's Non-goals and each task's Out of scope; do not
  re-litigate settled decisions found in the description.

## Implementation Ladder

Before adding new code, stop at the first rung that satisfies the task safely:

1. Remove, rename, or connect existing code instead of creating more code.
2. Use the language/runtime standard library.
3. Use native platform features: framework conventions, database constraints,
   shell commands, existing validation.
4. Use an already-installed dependency when it clearly fits.
5. Add the smallest local code change.
6. Add a new dependency, abstraction, service, or config surface only when
   the earlier rungs cannot meet the requirement cleanly.

Never simplify away input validation at trust boundaries, error handling that
prevents data loss, security controls, accessibility basics, or anything the
issue explicitly requires. If a deliberate shortcut has a known ceiling, make
it visible in the completion report.

## TDD Decision Rule

Use test-driven development when the change affects observable behavior
reachable through a public interface: bug fixes, APIs, CLI commands, UI
behavior, business rules, and any task whose Acceptance mentions tests.

Skip or adapt TDD when a failing behavior test would be artificial or low
value: docs-only, config-only, formatting-only, generated files, mechanical
renames with existing coverage, discovery tasks, or tiny changes already
proven by nearby tests. When TDD is skipped, still define concrete validation
before editing.

For each behavior, work in vertical slices: write one failing test through a
public interface, prove it fails for the expected reason, write the minimum
code to pass, then refactor only once green. Never write all tests first.
Keep tests as small as the implementation slice; non-trivial logic leaves
behind one runnable check that fails if the behavior regresses.

## Task Loop

Execute unblocked pending tasks in the Suggested Sequence order unless the
assignment names a narrower subset. For each task:

1. Implement to the task's Scope and Acceptance.
2. Run targeted validation for the task, then the broader relevant checks
   (test suite, typecheck, lint, build) as the task warrants.
3. Immediately check off that one task in the issue description — before
   starting the next task, never batched at the end:

   ```sh
   multica issue get <id> --output json | jq -r '.description' > /tmp/desc.md
   # flip exactly "- [ ] Tn:" to "- [x] Tn:" for the completed task
   multica issue update <id> --description-stdin < /tmp/desc.md
   ```

   Always re-read the description immediately before writing, and change
   nothing except the checkbox characters of tasks you completed.

## Blockers

If a task cannot be completed without changing scope, requirements, or a
public interface:

1. Stop the loop for that task; do not weaken or delete a valid failing test
   to get green, and do not check the task off.
2. Continue with other unblocked tasks when it is safe to do so.
3. Describe the blocker and the decision needed in the completion-report
   comment (or immediately, if nothing else can proceed).

## Finish

1. Run the broader validation pass across the whole change set.
2. Commit the work on the issue branch with clear messages, and push the
   branch to the remote. Multiple logical commits are fine.
3. Post one completion-report comment
   (`multica issue comment add <id> --content-stdin`; when the task was
   triggered by a comment, reply under it with `--parent`):
   - What changed.
   - Branch name pushed.
   - Whether TDD was used or skipped, and why.
   - Tests and validation commands run, with results.
   - Tasks checked off this run.
   - Deliberate simplifications and their ceilings.
   - Blockers, skipped validation, or residual risks.

## Prohibitions

- Never open a pull request.
- Never change the issue status; Multica's task lifecycle owns it.
- Never commit to the default branch, force-push, or rewrite branch history
  that was already pushed.
- Never edit description content other than your completed task checkboxes.
- Never revert or overwrite changes you did not make.
