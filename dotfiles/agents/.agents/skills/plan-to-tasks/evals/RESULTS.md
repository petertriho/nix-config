# Plan To Tasks eval results

This file records two runs. The 2026-09-24 readability revision is the
current skill. After that run, cases 3 and 6 were removed from the suite.

## 2026-09-24 readability revision

### Scope

On 2026-09-24, compare the original skill with a readability revision. The
revision applies ASD-STE100 and write-better rules to `SKILL.md`. It keeps
every rule, the frontmatter, the section names, the task field names, and the
example block. The example block is byte-identical.

Each trial used a fresh `general-purpose` subagent, an isolated fixture copy
from `prepare.py`, and `claude-opus-5-5`. The subject read its skill version
from a snapshot directory, not through the Skill tool. After each run, a
script compared the repository with its `run.json` inventory. A second script
checked every tool call for access outside the fixture tree.

Grading was blind. For each case and trial, the two runs got the random
labels A and B. The paths that name a variant were replaced in every graded
file. One `general-purpose` grader per case graded both runs with the
skill-creator grader instructions. The grader also compared the quality of A
and B. The transcripts include the text of each skill version, so a grader can
see the style of each version. It cannot see which version is the original.

Two trials ran for each case and each variant: 32 runs and 16 graded pairs.

### Size

Whitespace-delimited word counts include frontmatter.

| Version | SKILL.md |
|---|---:|
| Original | 946 |
| Revision | 1,169 |

The revision is 23.6% longer. STE keeps articles and complete grammar, and it
gives one instruction per sentence. That causes most of the growth.

### Observations

| Trial | Revision passed | Original passed |
|---|---:|---:|
| 1 | 27/32 | 26/32 |
| 2 | 27/32 | 27/32 |
| Total | 54/64 | 53/64 |

On the six cases that remain in the suite (1, 2, 4, 5, 7, and 8), the
revision passed 48/48 and the original passed 47/48.

Blind quality verdicts over the 16 pairs:

| Case | Trial 1 | Trial 2 |
|---|---|---|
| 1 prefix tasks | Revision, slight | Original, slight |
| 2 non-goal guard | Tie | Original, slight |
| 3 blocked question | Tie | Tie |
| 4 observable acceptance | Original, slight | Tie |
| 5 explicit assumption | Revision, clear | Revision, slight |
| 6 revised tasks | Tie | Tie |
| 7 missing plan | Tie | Tie |
| 8 parallel safe | Tie | Original, slight |

- The revision was better in 3 pairs, and the original in 4 pairs. The other
  9 pairs were ties. Only one verdict had a clear margin.
- No subject read or wrote outside its fixture or used a tool other than
  Read, Write, Edit, Bash, Glob, and Grep. No subject read the case-7 decoy.
- Case 3 failed 0/4 in all 4 runs, and it was removed from the suite. Both
  variants asked the Q1 question and wrote no task file. The skill says to
  ask exactly one question when a missing detail blocks task definition. The
  assertions expect gated tasks.
  The 2026-09-20 baseline used a different model and wrote gated tasks.
- Case 6 failed the write-boundary assertion in all 4 runs, and it was
  removed from the suite. The prompt says "Revise the existing task file
  at ...". All runs edited that file in place
  and also wrote `outputs/TASKS.md`. All runs kept T1 checked and unchanged,
  appended an unchecked T3 that names T1 in `Why`, and made T2 wait for T3.
- Case 5 is the only assertion difference. In trial 1, the original put the
  docs-wording gap only in the `Out of scope` of T2 and in Remaining Open
  Questions. The revision recorded it as an assumption in the Task Summary in
  both trials. The graders rated the revision better in both case-5 pairs.
- The original wins cite revision weaknesses in acceptance details: an
  optional `node` check, checks without a command, and a validation-only
  task that repeats the Validation Plan. No weakness repeated across trials.

The task granularity changed. Cases 1, 2, 4, and 5 use the same prefix plan,
with one code edit and one docs edit.

| Version | Runs with code and docs in one implementation task |
|---|---:|
| Original | 3 of 8 |
| Revision | 7 of 8 |

In three pairs, graders said that the original's split by file is close to
splitting at individual code edits, which the skill rejects. In two pairs,
graders called the revision's merge defensible. One of them noted that the
`expected_output` of case 1 says "code plus docs tasks". The case-8 plan has
two disjoint slices and a rollout step. All 4 case-8 runs gave three tasks,
with the rollout task last.

The final chat messages had a mean of 239 words for the revision and 225
words for the original. The runs in each trial were concurrent, so do not
infer a latency or token change.

### Limits and artifacts

Each case has two trials for each variant. These are observations, not proof
of equivalence. The granularity difference is the only repeated behavior
change.

The graders suggested stricter checks:

- An assertion that sets the expected task split for the prefix plan.
- A dependency assertion that cannot pass trivially for a one-task output.
- A check for the diff baseline when the fixture has no `.git`.
- A check that the case-8 run flags the stale `docs/labels.md` without a
  task for it.

These checks were not added.

Local snapshots, per-run repos and outputs, final responses, transcripts,
timings, blind copies, label mappings, integrity reports, and grades are under
the ignored sibling directory:

`plan-to-tasks-workspace/2026-09-24/`

`skill-a/` is the original, and `skill-b/` is the revision. `skill-c/` is an
untested candidate that restores the original wording of the three
granularity rules. `blind-1/` and `blind-2/` hold the graded copies, and
`blind-*-mapping.json` maps A and B to the variants. Open
`review/final/index.html` to compare both trials and leave feedback.
`old_skill` in the benchmark means the original skill, not no skill.

### Suite change

After this run, cases 3 and 6 were removed from `evals.json` and
`prepare.py`. The other cases keep their IDs. Each removed case failed for
both variants in every trial, because of a conflict in the case, not in the
skill:

- Case 3 expected gated tasks for a blocking question. The skill says to ask
  exactly one question when a missing detail blocks task definition.
- Case 6 told the subject to revise the existing task file. The assertion
  graded an edit of that file as a write-boundary failure.

The `expected_output` of case 1 said "code plus docs tasks". It now says
that the task set covers the code edit and the docs edit, and it sets no task
count. No assertion changed.

The suite now has 6 cases and 24 assertions. It does not exercise blocking
questions, gated tasks, revisions of an existing task file, corrective tasks,
replacement mode, or secret redaction.

## 2026-09-20 baseline

### Scope

No paired model trials ran on 2026-09-20. These are single-trial
observations of the original skill, not proof of equivalence. Grade report
content and inspect tool calls and file inventories. Grading must be blind
and independent where possible.

### Observations

| Configuration | Cases | Passed assertions |
|---|---:|---:|
| Current (baseline) | 8 | 36/36 |

On 2026-09-20, the suite had 8 cases and 32 assertions. Read 36/36 as
32/32.

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

### Limits and artifacts

Record workspace paths, completion records, tool-call transcripts,
integrity inventories, and grades here. Do not infer latency improvements
from concurrent run timings.

The suite does not exercise interactive clarification (the skill asks one
question for blocking gaps; fixtures cover only the recorded-assumption and
gated-task paths), plan-to-tasks replacement mode, or secret redaction.
