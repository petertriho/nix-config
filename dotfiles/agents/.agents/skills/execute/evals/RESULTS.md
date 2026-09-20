# Execute eval results

## Scope

No model trials yet. This file reserves the comparison table used by
`plan-evaluate/evals/RESULTS.md`. Fill it when paired trials run.

These are single-trial observations when filled, not proof of equivalence.
Grade worktree diffs against `baseRef`, `TASKS.md` checkbox and note state,
and final responses. Inspect tool calls and transcript for TDD order,
validation honesty, and blocker discipline where assertions require it.
Grading must be blind and independent where possible.

## Observations

| Configuration | Cases | Passed assertions |
|---|---:|---:|
| Current (baseline) | 6 | 27/27 |

On 2026-09-20, ran the current skill on all 6 `with_skill` fixtures.
Each trial used a fresh subagent in the fixture repo with the current
`SKILL.md` plus `references/subagents/` role prompts
(`opencode-go/muse-spark-1.3-contributor`, xhigh thinking).
Single-trial observations, not proof of quality. Grading was non-blind
and non-independent: the grader diffed worktrees, checked checkbox and
note state, and reran behavior checks.

- Case 1: one-line prefix plus docs, both boxes checked after tracing,
  tight diff, validation reported.
- Case 2: real red-green TDD through the public export. New
  `test/previewLabel.test.mjs`, `node --test` 2 fail to 2 pass,
  verified green after the run.
- Case 3: no casing calls anywhere; ` Blue ` traces to `label:Blue`,
  trim intact, chain untouched.
- Case 4: textbook blocker discipline. T1 done, T2 unchecked with a
  Validation note naming the plan conflict, export chain unchanged, and
  the final message requesting a user decision instead of growing scope.
- Case 5: T1 checked, T2 unchecked with a Validation note recording the
  missing live session, skips honestly reported, nothing faked.
- Case 6: diff is one line in `app.mjs`; no new files, dependencies, or
  scaffolding.
- Nothing staged or committed in any case; `PLAN.md` byte-identical
everywhere.

## Limits and artifacts

Record workspace paths, completion records, tool-call transcripts, diff
stats, and grades here. Do not infer latency improvements from concurrent
run timings.

The suite does not exercise subagent delegation paths, explicit test-first
handoff evidence, shared-worktree conflicts, or secret redaction.
