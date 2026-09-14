---
name: execution-review
description: "Review a completed implementation run against its PLAN.md and TASKS.md and write .artifacts/<plan-name>/REVIEW.md. Use for \"review the implementation of <plan>\", \"check TASKS.md acceptance\", \"verify the plan was implemented\", or the review phase of /pter. Checks every task's acceptance lines and checkbox state against the diff, confirms non-goals and settled decisions were respected, runs the plan's validation commands, and writes one review artifact. Not for ad-hoc diff review, \"look over my changes\", or \"review this diff\": use code-review for those. Depends on ../code-review/references/review-checklists.md for severity definitions."
disable-model-invocation: true
---

# Execution Review

## Inputs

Require readable `PLAN.md` and `TASKS.md`, usually in `.artifacts/<plan-name>/`.
Optional inputs: the implementation's starting commit as base ref and a
`REVIEW.md` target (default: next to `PLAN.md`).

- If an explicitly supplied `PLAN.md` or `TASKS.md` path is missing or
  unreadable, stop with "Nothing Reviewed". Never substitute another path.
- If only one input is omitted, use the sibling file next to the supplied
  input. If that sibling is missing or unreadable, stop with "Nothing Reviewed".
  Do not search another directory.
- If both inputs are omitted, list the repository root's `.artifacts/` directories
  by modification time. Select the newest directory containing both readable
  files. State the choice in the review.
  If no complete pair exists, stop with "Nothing Reviewed".

On input failure, use the Nothing Reviewed format in `references/output-format.md`.
Write it only to an explicit `REVIEW.md` target
or next to a valid resolved `PLAN.md`. Otherwise, report it in the final
response without creating a file.

## References

- Before writing: `references/output-format.md` (required structure).
- Before evaluating findings: `../code-review/references/review-checklists.md`
  (severity and review checks).
- For resolver output: `../code-review/references/diff-scope.md`.

## Boundaries

- Write only `REVIEW.md`. Never edit source, tests, `PLAN.md`, `TASKS.md`, or
  checkboxes. Report mismatches instead.
- Do not run fixers, formatters, generators, migrations, or commands that
  rewrite tracked files.
- Do not commit or stage.
- For requested fixes, stop and summarize actionable findings.
  Then wait for approval before switching to `execute` as a separate workflow.

## Workflow

1. **Read `PLAN.md`:** goal, non-goals, assumptions, settled decisions, and validation.
2. **Read every task:** checkbox, scope, out-of-scope notes, acceptance, `Why`
   supersession links, validation notes, and `Handoff evidence`.
3. **Resolve scope from the repository root:**
   - Base ref: `git-diff-scope --ref "$base" --include-untracked --pretty`.
   - No base ref: `git-diff-scope --pretty`.
   - If unavailable or failing, write Nothing Reviewed per the output format and stop.
     Never substitute another ref.
   - Review regular `?` entries as whole-file additions.
   - Base-ref scope includes all current untracked files and may include tracked/untracked
     changes that existed before implementation. Review the combined scope and record
     this attribution limit in `Review Limits`.
4. **Read every `entries[].patch` before final files.** Review the behavior introduced
   or changed by the patches.
5. **Resolve supersession links in `Why` against the revised plan.**
   - Supersession requires plan authorization and a corrective task covering the replacement.
   - Record superseded task IDs, acceptance lines, plan references, and corrective task IDs
     in `Review Limits`.
   - Exclude only that historical acceptance from conformance and checkbox mismatch checks.
   - Check corrective tasks and all unsuperseded acceptance normally.
6. **Assess explicit test-first delivery-time acceptance from saved `Handoff evidence`, not later green tests.**
   - Verify the recorded tests, command context, exit status, and failure reason support
     the agreed pre-implementation handoff.
   - Cite executor-reported evidence separately from review reruns.
     Missing or insufficient historical evidence is `unverified`.
   - Do not infer a past RED run from a checkbox or currently passing tests.
7. **Record each current acceptance line as `met`, `not met`, or `unverified`.**
   Include `path:line`, command output, or why verification was impossible.
8. **Check checkbox accuracy against the diff.**
   - Report `[x]` with `not met` acceptance and `[ ]` with fully `met` current acceptance as findings.
   - Diff presence is insufficient when acceptance is unmet or unverified.
9. **Note changes that no task covers.**
10. **Check non-goals and settled decisions.**
    Report implemented non-goals and reversed decisions, even when the code is correct.
11. **Apply `review-checklists.md` to the patches.**
    Keep only concrete problems with exact evidence, impact, and a correction.
    Tag each finding with its task ID or `untracked`.
12. **Run read-only validation named in `PLAN.md` and `TASKS.md`.**
    - Skip commands solely for superseded acceptance.
    - Use saved evidence for historical RED-only checks.
    - Run commands also validating current implementation with the current expected outcome.
    - Record each command, exit status, and short result.
13. **Write `REVIEW.md` exactly per `references/output-format.md`.**
    Verdict is `NEEDS CHANGES` when any CRITICAL or HIGH finding exists, any
    current acceptance line is `not met` for a `[x]` task, a non-goal was
    implemented, or a settled decision was reversed. Otherwise `APPROVED`.
14. **Report only the verdict, finding counts per severity, and `REVIEW.md` path.**

## Discipline

- Cite evidence, not intuition.
- Do not inflate severity or manufacture INFO findings for a clean result.
- Mark unreachable runtime checks `unverified` and explain why.
- Redact secret-like values; cite their kind and location only.
