# Plan To Tasks eval results

## Scope

No model trials yet. This file reserves the comparison table used by
`plan-evaluate/evals/RESULTS.md`. Fill it when paired trials run.

These are single-trial observations when filled, not proof of equivalence.
Grade report content and inspect tool calls and file inventories. Grading
must be blind and independent where possible.

## Observations

| Configuration | Cases | Passed assertions |
|---|---:|---:|
| Current (baseline) | 8 | 36/36 |

On 2026-09-20, ran the current skill on all 8 `with_skill` fixtures.
Each trial used a fresh subagent in the fixture repo with the current
`SKILL.md` (`opencode-go/muse-spark-1.3-contributor`, xhigh thinking).
Single-trial observations, not proof of quality. Grading was non-blind
and non-independent.

- Cases 1, 4, 8 passed every assertion: full Task Output Format
  sections, every task with Why, Depends on, Scope, Out of scope, and
  Acceptance, sane dependencies matching the Suggested Sequence.
- Case 4 acceptance is exemplary: exact `git diff` and `node -e` commands
  with expected outputs, including a `" Blue "` casing probe.
- Case 2 carries the rejected uppercase display in Out of scope on all
  three tasks and requires nothing outside the plan.
- Case 3 gates both tasks on Q1, quotes the two heading options only to
  leave them unresolved, and keeps Q1 a blocker in Remaining Open
  Questions.
- Case 5 records the wording gap as an interim assumption in the Task
  Summary and lets no task wait on it.
- Case 6 preserves T1 `[x]` and T2 `[ ]` verbatim, appends unchecked T3
  naming superseded T1 acceptance in Why, and reorders the sequence to
  T1, T3, T2. The existing task file is byte-identical after the run.
- Case 7 wrote nothing anywhere; the decoy was untouched.
- Five runners exited without a final message but left complete
  artifacts; grading used the files.

## Limits and artifacts

Record workspace paths, completion records, tool-call transcripts,
integrity inventories, and grades here. Do not infer latency improvements
from concurrent run timings.

The suite does not exercise interactive clarification (the skill asks one
question for blocking gaps; fixtures cover only the recorded-assumption and
gated-task paths), plan-to-tasks replacement mode, or secret redaction.
