---
name: execution-review
description: "Review a completed implementation run against its PLAN.md and TASKS.md and write .artifacts/<plan-name>/REVIEW.md. Use for \"review the implementation of <plan>\", \"check TASKS.md acceptance\", \"verify the plan was implemented\", or the review phase of /pter. Checks every task's acceptance lines and checkbox state against the diff, confirms non-goals and settled decisions were respected, runs the plan's validation commands, and writes one review artifact. Not for ad-hoc diff review, \"look over my changes\", or \"review this diff\": use code-review for those. Depends on ../code-review/references/review-checklists.md for severity definitions."
disable-model-invocation: true
---

# Execution Review

Review an implementation run against the plan that drove it and write one
review artifact, `REVIEW.md`. This skill is plan-aware where `code-review` is
diff-only: it checks acceptance criteria, checkbox accuracy, non-goals, and
settled decisions, and it may write `REVIEW.md`. It never edits anything else.

## Inputs

- `PLAN.md` path (required). Usually `.artifacts/<plan-name>/PLAN.md`.
- `TASKS.md` path (required). Usually next to `PLAN.md`.
- Base ref (optional). The commit the implementation started from, for example
  the output of `git rev-parse HEAD` taken before the run.
- `REVIEW.md` target (optional). Defaults to `REVIEW.md` next to `PLAN.md`.

If `PLAN.md` or `TASKS.md` cannot be found, list `.artifacts/` by modification
time, pick the newest directory that contains both files, and state that
choice in the review. If none exists, stop and report "Nothing Reviewed".

## References

- `references/output-format.md`: the required `REVIEW.md` structure. Read before
  writing the artifact.
- `../code-review/references/review-checklists.md`: severity definitions and
  review checks. Read before evaluating findings. Both skills are linked into the
  same skills directory.
- `../code-review/references/diff-scope.md`: how to read `git-diff-scope`
  output.

## Boundaries

- Write only `REVIEW.md`. Never edit source files, tests, `PLAN.md`, or
  `TASKS.md`. Do not tick or untick checkboxes; report mismatches instead.
- Do not run fixers, formatters, generators, migrations, or commands that
  rewrite tracked files. Run the read-only validation commands the plan names
  (tests, typecheck, lint, build).
- Do not commit or stage.
- If the user asks to fix findings, stop, summarize the actionable findings,
  and wait for approval before switching to `implement`.

## Workflow

1. **Read the plan and tasks.**
   - From `PLAN.md`: goal, non-goals, assumptions, settled decisions, and the
     validation section.
   - From `TASKS.md`: every task with its checkbox state, scope, out-of-scope
     notes, and acceptance lines.

2. **Resolve the review scope.**
   - With a base ref: `git-diff-scope --ref "$base" --pretty`.
   - Without a base ref: `git-diff-scope --pretty`.
   - Run from the repository root. If the resolver is unavailable or fails,
     write a "Nothing Reviewed" `REVIEW.md` per `references/output-format.md`
     and stop. Never substitute another ref.
   - Read every `entries[].patch` before reading final files. The review target
     is the behavior the patches introduce or change.

3. **Check task conformance.**
   - For each task, for each acceptance line, record `met`, `not met`, or
     `unverified`, with the evidence (`path:line`, command output, or the
     reason it could not be verified).
   - Confirm the checkbox state matches the diff: a `[x]` task whose acceptance
     is `not met` and a `[ ]` task whose work is present in the diff are both
     findings.
   - Note work in the diff that no task covers.

4. **Check non-goals and settled decisions.**
   - Confirm no non-goal was implemented.
   - Confirm no settled decision was reversed. A reversal is a finding even when
     the code is correct.

5. **Review the code.**
   - Apply `review-checklists.md` to the patches. Keep a finding only when it
     names a concrete problem with exact evidence, impact, and a correction.
   - Tag every finding with the task ID it belongs to, or `untracked` when no
     task covers the change.

6. **Run validation.**
   - Run the validation commands named in `PLAN.md` and `TASKS.md`. Record each
     command, its exit status, and a short result. Do not run commands with
     side effects on tracked files.

7. **Write `REVIEW.md`.**
   - Follow `references/output-format.md` exactly: verdict header, Task
     Conformance table, Findings in severity order, Validation Run, Review
     Limits.
   - Verdict is `NEEDS CHANGES` when any CRITICAL or HIGH finding exists, any
     acceptance line is `not met` for a `[x]` task, a non-goal was implemented,
     or a settled decision was reversed. Otherwise `APPROVED`.

8. **Report.**
   - Final message: the verdict, the count of findings per severity, and the
     `REVIEW.md` path. Do not restate the whole review.

## Discipline

- Cite code and command output, not intuition.
- Do not inflate severity, and do not manufacture INFO findings for a clean
  result.
- `unverified` is an honest answer when a check needs a runtime the review
  cannot reach. Say why.
- Redact secret-like values; cite their kind and location only.
