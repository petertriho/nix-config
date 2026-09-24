# Execution Review eval results

This file records two evaluations. The 2026-09-24 readability revision is
the current skill.

## 2026-09-24 readability revision

### Scope

On 2026-09-24, compare the original skill with a readability revision. The
revision applies ASD-STE100 and write-better rules to `SKILL.md` and to the
prose of `references/output-format.md`. It keeps every rule, the
frontmatter, the section names, and the verdict strings. The templates in
`references/output-format.md` are unchanged.

The revision uses one term for each concept:

- "Checked task" and "unchecked task" mean a task with `[x]` or `[ ]`. The
  workflow defines the two terms once.
- "Current acceptance" and "superseded acceptance" replace "unsuperseded
  acceptance" and "historical acceptance". "Historical" now refers only to
  the state at the test-first handoff.
- "Delivery-time acceptance" gets a definition and an example.
- "Untracked changes" gets a definition: changes that no task covers. Git
  uses "untracked" with a different meaning.

Cases 9 to 11 were added for this comparison. The earlier suite did not
cover these rules:

- Case 9: a valid supersession (step 5).
- Case 10: an explicit test-first handoff with insufficient `Handoff
  evidence` (step 6).
- Case 11: a prompt with no plan paths. The review must select the newest
  `.artifacts` directory that has both files (Inputs).

Each subject run used a fresh `general-purpose` subagent, an isolated
fixture copy from `prepare.py`, and `claude-opus-5-5`. The subject read its
skill version from a snapshot directory, not through the Skill tool. After
each run, a script recorded these harness facts:

- The file changes against a pristine copy of the fixture.
- Git HEAD, the commit count, the refs, the staged files, the stash entries,
  and the worktrees.
- The files in `outputs/`, the verdict line, and the finding headings.
- In case 11, the modification times of the `.artifacts` directories.

A second script checked every tool call for paths outside the run directory
and the skill snapshot.

Grading was blind. For each case and trial, the two runs got the random
labels A and B. The paths and names that identify a variant were replaced
in every graded file. The graded transcripts omit the results of the
skill-file reads, because the revised text identifies the variant. One
`general-purpose` grader per case and trial graded both runs with the
skill-creator grader instructions. The grader also compared the quality of
A and B.

| Trials | Cases | Case-10 fixture |
|---|---|---|
| 1, 2 | All 11 | First version |
| 3, 4 | 10 only | Corrected version (see Suite change) |

`prepare.py` sets fixed commit dates, so every trial gets the same base
commits.

### Size

Whitespace-delimited word counts include frontmatter.

| Version | SKILL.md | Output format | Combined |
|---|---:|---:|---:|
| Original | 855 | 473 | 1,328 |
| Revision | 1,254 | 517 | 1,771 |

The revised `SKILL.md` is 46.7% longer than the original, and the combined
text is 33.4% longer. STE keeps articles and complete grammar, and it gives
one instruction per sentence. These inline rules became lists:

- The steps to stop with Nothing Reviewed.
- The checkbox mismatch states in step 8.
- The tag rules in step 11.
- The verdict conditions in step 13.

The new definitions add the rest. The mean token count for each run did not
increase (see Observations).

### Observations

Passed assertions and blind verdicts against the original:

| Trials | Revision passed | Original passed | Verdicts |
|---|---:|---:|---|
| 1 | 54/56 | 54/56 | 5 ties, 6 slight revision wins |
| 2 | 55/56 | 53/56 | 10 ties, 1 slight revision win |
| 3, 4 | 12/12 | 12/12 | 1 slight revision win, 1 slight original win |
| All | 121/124 | 119/124 | 15 ties, 8 slight revision wins, 1 slight original win |

- Every run gave the expected verdict: `APPROVED` in cases 1 and 6 to 11,
  `NEEDS CHANGES` in cases 2 to 4, and `NOTHING REVIEWED` in case 5.
- In 22 of 24 pairs, both runs passed the same assertions. No assertion
  failed only for the revision.
- The original failed two assertions that the revision passed:
  - In trial 2, case 1, the original run wrote `/tmp/before_status.txt` and
    then deleted it. The skill permits only `REVIEW.md`.
  - In trial 2, case 10, the original run marked the "T1 test unchanged"
    clause `unverified`. That clause is the fixture flaw that trials 3 and 4
    correct.
- Case 2, assertion 4 failed in all 4 runs. The assertion asks the finding
  to cite the exact acceptance line. The runs cite the line in Task
  Conformance, and the finding template has no field for it.
- In cases 9 to 11, every run passed every assertion, except case 10,
  assertion 5 before the fixture fix.
- The finding counts were the same in 20 of 24 pairs. In 3 of the 4 case-10
  pairs, the original added a MEDIUM finding that repeats the `unverified`
  T1 row. In trial 2, case 4, the revision added two MEDIUM checkbox
  findings with the same root cause as its HIGH finding. Step 8 of both
  versions reports each checkbox mismatch as a finding, and the output
  format merges findings that have one root cause.
- No run changed a repository file, moved HEAD, staged a file, or created a
  stash entry.

Step 14 of both versions limits the final response to the verdict, the
number of findings for each severity, and the path of `REVIEW.md`. No
assertion checks this rule. Final-response length:

| Version | Runs | Median | Mean | 40 words or fewer |
|---|---:|---:|---:|---:|
| Original | 24 | 157 words | 137 words | 3 |
| Revision | 24 | 24 words | 50 words | 14 |

- All 8 revision wins cite the final response.
- The original win (trial 4, case 10) came from a run that reproduced the
  historical RED state against the base code, in memory. The grader counted
  this as more evidence. Step 12 of both versions says not to run a check
  that only proves a historical RED state.

Mean time and tokens:

| Version | Runs | Time | Tokens (15 pairs) |
|---|---:|---:|---:|
| Original | 24 | 84.3 s | 35,724 |
| Revision | 24 | 80.3 s | 35,085 |

The runs in each trial were concurrent, so do not infer a latency change.
In trial 1, 17 of the 22 runs started as teammates, and their session logs
have no total token count. The token column uses only the 15 pairs in which
both runs have a count.

### Suite change

The first case-10 fixture gave T2 this acceptance: "`node --test` passes
with the T1 test unchanged". The test file is untracked, and no snapshot
records it at the handoff, so a reviewer cannot verify the "unchanged"
clause. The skill rules make that clause `unverified`, but the expected
output and assertion 5 expected `met`. In trials 1 and 2, three of the four
runs marked the clause `unverified`, and the graders failed them.

The T2 acceptance now reads "`node --test` passes". T2 still lists test
edits as out of scope. Trials 3 and 4 use the corrected fixture.

### Limits and artifacts

Each case has two trials for each version, and case 10 has four. These are
observations, not proof of equivalence.

The assertions are at the ceiling. The graders suggested these stricter
checks:

- An assertion on the final-response rule of step 14 in every case.
- An assertion that a `node --test` run with 0 tests is not reported as
  behavior evidence. Only case 10 has a test file.
- Assertions for each acceptance line, so that a review that marks every
  line `met` fails. Examples are the `" blue "` trace line in cases 3 and 4
  and the "no other source change" line in case 4.
- Checkbox mismatch assertions for T1 and T2 in cases 3 and 4.
- An expected severity band for the stale-docs finding in case 8 and for
  the missing handoff evidence in case 10.
- In case 2, a field for the acceptance line in the finding template, or an
  assertion that accepts the conformance row. The implementation patch in
  case 2 is empty, so the case tests checked tasks with no diff.

These cases do not discriminate between the variants:

- Case 5: no run listed `.artifacts/`, so no run saw the decoy.
- Case 7: the expected output names an "unplanned uppercase preference",
  but the prompt and the fixture do not contain it.
- Case 11: both variants gave nearly identical reports. A newest directory
  with an unreadable `TASKS.md`, or two directories with the same
  modification time, is a harder test.

The suite still does not exercise unreadable files, denied output writes, a
Nothing Reviewed report in the final response, or secret redaction.

Workspace: `dotfiles/agents/.agents/skills/execution-review-workspace/2026-09-24/`,
which git ignores. It has these items:

- The skill snapshots (`skill-a` is the original, `skill-b` is the revision).
- The pristine fixtures, the trial directories, and the blind copies and
  mappings.
- The review tree with `benchmark.json`.
- The harness scripts in `tools/`.

## 2026-09-20 baseline

### Scope

On 2026-09-20, run the current (unrevised) skill on all 8 `with_skill`
fixtures as a baseline. Each trial used a fresh subagent in the fixture
repo, the current `SKILL.md` plus `references/output-format.md`,
`../code-review/references/review-checklists.md`, and
`../code-review/references/diff-scope.md`. Runners were
`opencode-go/muse-spark-1.3-contributor` with xhigh thinking.

Single-trial observations, not proof of quality. Grading was non-blind and
non-independent (the harness author graded report content and inspected
tool behavior and file inventories).

### Size

Whitespace-delimited word counts include frontmatter. They were measured
on 2026-09-24 from commit `c9af6bf5` (current) and commit `b4110ecd`
(revised).

| Version | SKILL.md | Output format | Combined |
|---|---:|---:|---:|
| Current | 813 | 473 | 1,286 |
| Revised | 855 | 473 | 1,328 |

### Observations

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

### Limits and artifacts

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
