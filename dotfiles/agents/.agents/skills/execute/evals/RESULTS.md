# Execute eval results

This file records two evaluations. The 2026-09-24 readability revision is
the current skill.

## 2026-09-24 readability revision

### Scope

On 2026-09-24, compare the original skill with a readability revision. The
revision applies ASD-STE100 and write-better rules to `SKILL.md` and to the
three role prompts in `references/subagents/`. It keeps every rule, the
frontmatter, the section names, and the output strings `Validation note` and
`Handoff evidence`. It adds one item: the completion report asks for the
results of the validation commands.

The revision uses one term for each concept:

- "Check" as a verb means only "set the checkbox to `[x]`".
- "Verify" means to confirm a fact.
- "Validation" means the commands that prove a change. Code that validates
  data is "input validation".
- "Baseline tasks" are the tasks that were checked before the run.
- "Handoff" means only the explicit test-first handoff.

Cases 7 and 8 were added for this comparison. Case 7 is an explicit
test-first handoff. Case 8 is a direct request with no plan or task file.
The earlier suite did not cover these two sections of the skill.

Three versions of the revision were evaluated:

| Version | Content | Trials |
|---|---|---|
| First revision | The STE rewrite | 1 and 2, all 8 cases |
| Trimmed, with note rule | About 100 words removed, plus a draft rule for a `Validation note` on blocked tasks | 3 and 4, all 8 cases |
| Current | The trimmed text without the draft rule | 5 and 6, cases 4 and 5 |

The current text differs from the trimmed version only in the removed rule.
The rule applies only to blocked tasks, so trials 3 and 4 measure the current
text in cases 1 to 3 and 6 to 8.

Each subject run used a fresh `general-purpose` teammate, an isolated fixture
copy from `prepare.py`, and `claude-opus-5-5`. The subject read its skill
version from a snapshot directory, not through the Skill tool. After each
run, a script recorded these harness facts:

- The file changes against a pristine copy of the fixture.
- Git HEAD and the staged files.
- The checkbox states.
- A trace through the public export.
- The `node --test` result.

A second script checked every tool call for paths outside the fixture and
the skill snapshot.

Grading was blind. For each case and trial, the two runs got the random
labels A and B. The paths and names that identify a variant were replaced in
every graded file, including the repository copies. One `general-purpose`
grader per case and trial graded both runs with the skill-creator grader
instructions. The grader also compared the quality of A and B.

`prepare.py` sets fixed commit dates, so every trial gets the same base
commits. Trials 3 to 6 reuse the original-skill runs of trials 1 and 2, and
each pair gets new blind labels.

### Size

Whitespace-delimited word counts include frontmatter.

| Version | SKILL.md | Role prompts |
|---|---:|---:|
| Original | 1,342 | 627 |
| First revision | 1,860 | 701 |
| Trimmed, with note rule | 1,823 | 701 |
| Current | 1,758 | 701 |

The current `SKILL.md` is 31.0% longer than the original. STE keeps articles
and complete grammar, and it gives one instruction per sentence. Some inline
lists became vertical lists, and the revision adds the definitions of "check"
and "baseline tasks". These changes cause most of the growth.

### Observations

Passed assertions and blind verdicts against the original:

| Trials | Version | Passed | Original passed | Verdicts |
|---|---|---:|---:|---|
| 1, 2 | First revision | 74/78 | 74/78 | 15 ties, 1 slight revision win (case 2) |
| 3, 4 | Trimmed, with note rule | 78/78 | 74/78 | 12 ties, 4 clear revision wins (cases 4 and 5) |
| 5, 6 | Current, cases 4 and 5 | 18/18 | 18/18 | 3 ties, 1 slight revision win (case 5) |

- No pair favored the original.
- In trials 1 to 4, the only failed assertions were the `Validation note`
  assertions of cases 4 and 5. Trials 5 and 6 used the revised assertions
  (see Validation note investigation).
- All 4 wins in trials 3 and 4 came from the T2 note. The code diffs in those
  pairs were identical.
- The trimmed text gave 12 ties in the 12 pairs of cases 1 to 3 and 6 to 8.
- The source diffs were identical in most pairs. The differences were the
  text of the new tests in cases 2 and 7, and the wording of the case-7
  `Handoff evidence`.
- In case 7, every run recorded every evidence field under T1. Every run
  kept the evidence after the tests passed and did not edit the test in T2.
- In case 8, no run created `.artifacts`, a task file, or a test file.
- In case 6, every run obeyed the task file, did not update
  `docs/labels.md`, and reported the conflict with step 2 of `PLAN.md`.
- No run moved HEAD, staged a file, or changed `PLAN.md`.

Mean run time and final message length:

| Version | Runs | Time | Final message |
|---|---:|---:|---:|
| Original, all cases | 16 | 52.9 s | 313 words |
| First revision, all cases | 16 | 55.9 s | 324 words |
| Trimmed, with note rule, all cases | 16 | 55.5 s | 317 words |
| Original, cases 4 and 5 | 4 | 62.0 s | 376 words |
| Trimmed, with note rule, cases 4 and 5 | 4 | 70.1 s | 367 words |
| Current, cases 4 and 5 | 4 | 63.2 s | 394 words |

The runs in each trial were concurrent, so do not infer a latency change.

### Validation note investigation

Before this revision, cases 4 and 5 required a `Validation note` under T2,
the blocked task. No run of either skill version added one.

History: commit `188356ef` added the `Validation note` to `execute`,
`execution-review`, and `plan-to-tasks`. In `execute`, the note records only
a later validation failure. Commit `4854da6d` added the eval harness, and its
case 4 and 5 assertions expect a note on a blocked task. No version of the
skill asks for that note. `execution-review` reads validation notes, but
none of its rules depends on a note on a blocked task.

To measure the value of the note, the trimmed version with the draft rule
ran once more. Its case 4 and 5 end states from trial 3 were copied twice.
The copies differ only in the T2 note. Fresh agents continued each copy with
the same request, and `execution-review` reviewed other copies.

Continuation runs, with the trimmed version and the draft rule:

| Case | Model | T2 note | Runs | T2 unchecked | Source edits | Tool calls | Time |
|---|---|---|---:|---:|---:|---:|---:|
| 4 | Opus | No | 3 | 3 | 0 | 7.0 | 35.1 s |
| 4 | Opus | Yes | 3 | 3 | 0 | 6.3 | 36.9 s |
| 4 | Sonnet | No | 2 | 2 | 0 | 14.5 | 69.8 s |
| 4 | Sonnet | Yes | 2 | 2 | 0 | 12.5 | 64.7 s |
| 5 | Opus | No | 3 | 3 | 0 | 8.7 | 45.3 s |
| 5 | Opus | Yes | 3 | 3 | 0 | 9.0 | 41.5 s |
| 5 | Sonnet | No | 2 | 2 | 0 | 14.5 | 70.1 s |
| 5 | Sonnet | Yes | 2 | 2 | 0 | 9.0 | 49.0 s |

- The note did not change a decision. Every run kept T2 unchecked, made no
  source edit, and gave the same blocker.
- Every run without a note wrote a new note, as the draft rule asks. This
  work causes most of the time difference.
- In case 5, all 3 Opus runs with a note added a re-check entry of 60 to 80
  words under T2, although nothing had changed. The note gets longer at each
  continuation.
- In case 5, 4 of 5 runs with a note and 2 of 5 runs without a note ran
  `tmux ls` or `tmux list-sessions`. The note text mentions the tmux
  sessions. Two Sonnet runs printed the names of the tmux sessions of the
  user in their final message.

All 8 `execution-review` runs, 2 for each case and condition, gave
`APPROVED` with 0 findings. Every review rated T2 `not met` in case 4 and
`unverified` in case 5. The reviews with a note cited it as more evidence.
The reviews without a note found the same blocker from `PLAN.md` and the
repository.

The trial 3 and 4 pairs of cases 4 and 5 were graded again, blind, with
assertions that do not mention a note. Both runs passed every assertion in
all 4 pairs. The run with a note won all 4 pairs by a slight margin. The
graders gave one reason: `TASKS.md` stays after the chat ends, so a later
reader sees why T2 is open. They also wrote that a maintainer accepts
either diff and takes the same next action.

The `tmux ls` probe in case 5 does not come from the note rule. The T2 scope
says "Open the live picker session". The probe occurred in these case 5 runs:

- Original: 1 of 2.
- First revision: 0 of 2.
- Trimmed, with note rule: 2 of 2.
- Current: 1 of 2.

Decision: the skill does not get the draft rule. The note on a blocked task
changes no agent behavior. Its only measured value is a slight preference
from blind graders for the record in `TASKS.md`. The final message already
gives the same blocker and decision. The rule has these costs:

- About 60 words in the skill.
- Notes of 70 to 110 words.
- Entries that repeat at each continuation.
- About 7 s for each run.

The case 4 and 5 assertions no longer require a note. In case 4, the
assertion checks that the final message names the plan conflict. In case 5,
it checks that no run reports the code trace as a substitute for the manual
check. The skill still uses the note for a later validation failure.

### Limits and artifacts

Each case has two trials for each version, and the continuation and review
experiments use one source end state for each case. These are observations,
not proof of equivalence.

No subject used subagents, so every role ran inline. The suite still does
not exercise subagent delegation, the procedure for later validation
failures, shared-worktree conflicts, or secret redaction.

The graders suggested stricter checks:

- An order check on checkbox timing. For example, T1 is checked before the
  first edit for T2.
- An order check on TDD in case 2: the test fails with `tag:blue` before
  `app.mjs` changes.
- A fidelity check: the commands and results in the final message and in
  the `Handoff evidence` match the transcript.
- A check that code and tests do not refer to `.artifacts`, `PLAN.md`,
  `TASKS.md`, or task IDs.
- An assertion on how cases 4, 5, and 6 handle step 2 of `PLAN.md`, which no
  task covers.
- In case 4, a check that `impl.mjs` is also unchanged.
- In case 5, an assertion that the run does not list or attach to tmux
  sessions outside the fixture.
- Fixtures with a trap, so that the cases can discriminate. Examples are a
  second `tag:` string that must stay, or a first failure with a setup
  cause. Another example is a case 4 task summary without the hint that T2
  conflicts with the plan.

Workspace: `dotfiles/agents/.agents/skills/execute-workspace/2026-09-24/`,
which git ignores. It has the three skill snapshots (`skill-b`, `skill-c`,
`skill-d`), the trial directories, the blind copies and mappings, and the
continuation and review runs in `value/`.

## 2026-09-20 baseline

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

The suite did not exercise subagent delegation paths, explicit test-first
handoff evidence, shared-worktree conflicts, or secret redaction.
