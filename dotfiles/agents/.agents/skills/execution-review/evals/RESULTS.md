# Execution Review eval results

## Scope

On 2026-09-20, run the current (unrevised) skill on all 8 `with_skill`
fixtures as a baseline. Each trial used a fresh subagent in the fixture
repo, the current `SKILL.md` plus `references/output-format.md`,
`../code-review/references/review-checklists.md`, and
`../code-review/references/diff-scope.md`. Runners were
`opencode-go/muse-spark-1.3-contributor` with xhigh thinking.

Single-trial observations, not proof of quality. Grading was non-blind and
non-independent (the harness author graded report content and inspected
tool behavior and file inventories).

## Size

Not yet measured. Record whitespace-delimited word counts for SKILL.md
plus required format references here when comparing revisions.

| Version | SKILL.md | Output format | Combined |
|---|---:|---:|---:|
| Current | TBD | TBD | TBD |
| Revised | TBD | TBD | TBD |

## Observations

| Configuration | Cases | Passed assertions |
|---|---:|---:|
| Current (baseline, old text) | 8 | 38/39 |
| Revised (step-11 tag rule, cases 3–4 only) | 2 | 10/10 |

- Cases 1, 2, 4, 5, 6, 7, 8 passed every assertion: correct verdicts
  (`APPROVED` / `NEEDS CHANGES` / `NOTHING REVIEWED`), checkbox-mismatch
  detection, non-goal and settled-decision checks, `unverified` handling
  for the offline TUI line, no imported unplanned scope, and correct
  treatment of the deferred unchecked task.
- Case 3 passed 4/5. The uppercase non-goal violation was caught with
  trace evidence and correct `NEEDS CHANGES`, but the finding is tagged
  `(untracked)` instead of a task ID. The extra `impl.mjs` change has no
  covering task (T1 scope is `app.mjs` only), so `(untracked)` is
  defensible — but the assertion asks for a task-ID tag. Either the skill
  should state how to tag implemented non-goals that also break a checked
  task's acceptance, or the assertion should accept `(untracked)` with a
  conformance link. Same `(untracked)` tag appears in case 4, whose
  assertions do not constrain the tag.
- Every run preserved its repository inputs: `input_manifest` equality
  held for all 8, `outputs/` contained only `REVIEW.md`, and no
  `PLAN.md`/`TASKS.md` checkbox changed.
- Three runners (cases 4, 6, 8) exited without a final message but left
  complete, well-formed artifacts; grading used the files. Final-message
  minimalism is therefore not established by this pass.

## Limits and artifacts

Runs occurred concurrently; completion times include launch/provider
delays. Do not infer a latency result from these timings.

The suite does not exercise implicit newest-directory selection,
unreadable files, denied output writes, every invalid status value, or
secret redaction.

Local fixtures, raw reports, completion records, and inventories are under
the ignored sibling directory:

`execution-review-workspace/2026-09-20/`

Follow-up: the single miss (case-3 finding tagged `(untracked)` instead of
a task ID) led to a one-paragraph addition to step 11 of `SKILL.md`: a
finding that breaks a checked task's acceptance carries that task's ID, and
`(untracked)` is reserved for changes that break no task acceptance. Reruns
of cases 3 and 4 on the pristine `old_skill` fixtures with the revised text
tag `(T1)`, keep correct verdicts and mismatches, and preserve inputs:
10/10 assertions. Single-trial signal only; a full 8-case paired run with
snapshotted skill texts is still open.

`old_skill` variants for the remaining six cases were prepared but not run;
the next comparison should run old and revised skills paired per fixture
with copied skill snapshots rather than in-place reads.
