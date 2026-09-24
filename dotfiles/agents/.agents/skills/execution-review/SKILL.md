---
name: execution-review
description: "Review a completed implementation run against its PLAN.md and TASKS.md and write .artifacts/<plan-name>/REVIEW.md. Use for \"review the implementation of <plan>\", \"check TASKS.md acceptance\", \"verify the plan was implemented\", or the review phase of /peter. Checks every task's acceptance lines and checkbox state against the diff, confirms non-goals and settled decisions were respected, runs the plan's validation commands, and writes one review artifact. Not for ad-hoc diff review, \"look over my changes\", or \"review this diff\": use code-review for those. Depends on ../code-review/references/review-checklists.md for severity definitions."
disable-model-invocation: true
---

# Execution Review

## Inputs

The review needs a readable `PLAN.md` and a readable `TASKS.md`. They are
usually in `.artifacts/<plan-name>/`. Two inputs are optional:

- The base ref: the commit where the implementation started.
- The review target: the path of `REVIEW.md`. The default is `REVIEW.md`
  next to `PLAN.md`.

Resolve `PLAN.md` and `TASKS.md` with these rules:

- If the user gives a path to `PLAN.md` or `TASKS.md` and the file is missing
  or unreadable, stop with Nothing Reviewed. Never use a different path.
- If the user gives only one of the two files, use the other file from the
  same directory. If that file is missing or unreadable, stop with Nothing
  Reviewed. Do not search other directories.
- If the user gives neither file, sort the directories in `.artifacts/` at the
  repository root by modification time. Select the newest directory in which
  both files are readable. In the review, state which directory you
  selected. If no directory contains both readable files, stop with Nothing
  Reviewed.

To stop with Nothing Reviewed:

1. Use the Nothing Reviewed format in `references/output-format.md`.
2. If the user gave a review target, write the report there.
3. If the user gave no review target and a readable `PLAN.md` is resolved,
   write the report to `REVIEW.md` next to that `PLAN.md`.
4. Otherwise, do not create a file. Give the report in the final response.

## References

- `references/output-format.md`: the required structure of `REVIEW.md`. Read
  it before you write the review.
- `../code-review/references/review-checklists.md`: the severity definitions
  and the review checks. Read it before you assess findings.
- `../code-review/references/diff-scope.md`: how to read the output of the
  resolver. Read it before you use that output.

## Boundaries

- Write only `REVIEW.md`. Never edit source, tests, `PLAN.md`, `TASKS.md`, or
  checkboxes. Report each mismatch in the review instead.
- Do not run fixers, formatters, generators, migrations, or other commands
  that rewrite tracked files.
- Do not stage or commit.
- If the user asks for fixes, summarize the actionable findings and stop. Wait
  for approval before you start `execute` as a separate workflow.

## Workflow

In this workflow, a checked task has `[x]` and an unchecked task has `[ ]`.

1. **Read `PLAN.md`.** Note the goal, non-goals, assumptions, settled
   decisions, and validation.
2. **Read every task in `TASKS.md`.** Note the checkbox, scope, out-of-scope
   notes, acceptance, supersession links in `Why`, each `Validation note`, and
   the `Handoff evidence`.
3. **Resolve the scope from the repository root.**
   - If you have a base ref, run
     `git-diff-scope --ref "$base" --include-untracked --pretty`.
   - If you have no base ref, run `git-diff-scope --pretty`.
   - If the resolver is not available or fails, stop with Nothing Reviewed.
     Never use a different ref.
   - A scope with a base ref includes all current untracked files. It can
     also include tracked and untracked changes that existed before the
     implementation. Review the full scope. Record this attribution limit in
     `Review Limits`.
4. **Read every `entries[].patch` before you read the final version of a
   file.** Review the behavior that the patches add or change. Review each
   regular entry with status `?` as a whole-file addition.
5. **Verify each supersession link in `Why` against the revised plan.**
   A supersession is valid only if the plan authorizes it and a corrective
   task covers the replacement. For each valid supersession:
   - In `Review Limits`, record the superseded task IDs, the superseded
     acceptance lines, the plan references, and the corrective task IDs.
   - Exclude only the superseded acceptance from the conformance check and
     the checkbox mismatch check.

   Current acceptance is all acceptance that no valid supersession replaces.
   Assess the corrective tasks and all current acceptance normally.
6. **Assess the delivery-time acceptance of an explicit test-first handoff
   only from the saved `Handoff evidence`.** Delivery-time acceptance
   describes the state at the handoff, before the implementation. An example
   is a new test that fails against the old code.
   - Verify that the recorded tests, command context, exit status, and
     failure reason support the agreed handoff.
   - Cite the evidence that the executor reported separately from the
     results of your own reruns.
   - If the historical evidence is missing or insufficient, record the line
     as `unverified`.
   - Do not infer a past RED run from a checkbox or from tests that pass now.
7. **Record each current acceptance line as `met`, `not met`, or
   `unverified`.** Give the evidence: a `path:line`, the command output, or
   the reason why you could not verify the line.
8. **Compare each checkbox with the acceptance results.** Only these states
   are checkbox mismatches. Report each one as a finding:
   - A checked task with a current acceptance line that is `not met`.
   - An unchecked task with all current acceptance `met`.

   A related change in the diff does not make a `not met` or `unverified`
   line `met`.
9. **List the changes that no task covers in `Untracked changes`.** Here,
   "untracked" means that no task covers the change. It does not mean that
   Git does not track the file.
10. **Compare the diff with the non-goals and settled decisions.** Report each
    implemented non-goal and each reversed decision, even when the code is
    correct.
11. **Apply `review-checklists.md` to the patches.** Keep only concrete
    problems. Give each problem exact evidence, the impact, and a correction.
    Tag each finding with one task ID or with `(untracked)`:
    - If the finding breaks the acceptance of a checked task, use the ID of
      that task. This rule also applies to untracked changes, implemented
      non-goals, and reversed decisions. If the change is out of the scope of
      the task, name the change in the body of the finding.
    - If the finding breaks no acceptance and a task covers the change, use
      the ID of that task.
    - Use `(untracked)` only for a change that no task covers and that breaks
      no task acceptance.
12. **Run the read-only validation commands that `PLAN.md` and `TASKS.md`
    name.**
    - If a command validates only superseded acceptance, skip it.
    - If a command only proves a historical RED state, do not run it. Use the
      saved evidence.
    - If a command also validates the current implementation, run it. Compare
      the result with the current expected outcome.
    - Record each command, its exit status, and a short result.
13. **Write `REVIEW.md` exactly as `references/output-format.md` specifies.**
    The verdict is `NEEDS CHANGES` if one or more of these conditions is true:
    - A CRITICAL or HIGH finding exists.
    - A checked task has a current acceptance line that is `not met`.
    - The diff implements a non-goal.
    - The diff reverses a settled decision.

    Otherwise, the verdict is `APPROVED`.
14. **In the final response, give only the verdict, the number of findings
    for each severity, and the path of `REVIEW.md`.**

## Discipline

- Cite evidence, not intuition.
- Do not inflate severity. Do not add INFO findings to a clean result.
- If you cannot do a runtime check, mark it `unverified` and give the reason.
- Redact values that look like secrets. Cite only the kind of value and its
  location.
