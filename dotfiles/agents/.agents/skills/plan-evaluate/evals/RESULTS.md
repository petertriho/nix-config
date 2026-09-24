# Plan Evaluate revision results

This file records two revisions. The 2026-09-24 readability revision is the
current skill.

## 2026-09-24 readability revision

### Scope

On 2026-09-24, compare the original skill with a readability revision. The
revision applies ASD-STE100 and write-better rules to `SKILL.md` and to the
prose of `references/output-format.md`. It keeps every rule, the frontmatter,
the section names, and the output strings. Both report templates are
byte-identical.

Each trial used a fresh `general-purpose` subagent, an isolated fixture copy
from `prepare.py`, and `claude-opus-5-5`. The subject read its skill version
from a snapshot directory, not through the Skill tool. One `general-purpose`
grader subagent per case graded both variants with the skill-creator grader
instructions. The grader saw the variant names, so grading was not blind.
After each run, a script compared the repository with its `run.json`
inventory.

Three revision candidates were tested. Each trial of a candidate was paired
with a fresh trial of the original in the same batch.

| Version | Change | Trials |
|---|---|---|
| v1 | STE and write-better rewrite | 11 cases × 1 |
| v2 | "flag the hidden decisions", "Record the omitted risks", and "Use `NOTE` for other findings" restore the scope of the original | 8 cases × 2, then case 4 × 4 |
| v3 (current) | "Do not manufacture findings" and one bullet for the settled-scope rule, as in the original | all 11 cases × 1, then case 4 × 6 |

### Size

Whitespace-delimited word counts include frontmatter and the required format.

| Version | SKILL.md | Output format | Combined |
|---|---:|---:|---:|
| Original | 815 | 437 | 1,252 |
| Revised (v3) | 1,168 | 474 | 1,642 |

`SKILL.md` is 43.3% longer. The combined instructions are 31.2% longer. STE
keeps articles and complete grammar, and it gives one instruction per
sentence. That causes most of the growth.

### Observations

| Batch | Revision | Cases × trials | Revision passed | Original passed |
|---|---|---|---:|---:|
| Iteration 1 | v1 | 11 × 1 | 45/47 | 45/47 |
| Iteration 2 | v2 | 8 × 2 | 71/74 | 71/74 |
| Iteration 3 | v2 | case 4 × 4 | 20/20 | 20/20 |
| Iteration 4 | v3 | case 4 × 6 | 30/30 | 30/30 |
| Iteration 5 | v3 | 10 × 1 | 41/42 | 39/42 |

- Verdicts, plan status, and BLOCKING counts matched in all 47 pairs. All
  94 runs passed the integrity check. No subject ran `scripts/check`.
- Of the 8 original failures and 6 revision failures, 8 are the "No findings"
  assertion in cases 1 and 6. The fixtures have no `.git`, so the plan's
  "Review the diff" has no baseline. Both variants report this as a NOTE in
  some trials and as an evaluation limit in others.
- The case-3 NOTE about the unverified Archive Intake premise was missing in
  3 original runs and 2 revision runs. One original run in case 2 added a
  NOTE that repeats a BLOCKING root cause.
- In iteration 5, graders rated v3 better in cases 1 and 6. It put the
  missing baseline under Evaluation Limits and wrote "No findings". They
  rated the other cases ties. In iteration 1, they rated the original better
  in cases 1 and 4, and the revision better in cases 2 and 3. In iteration 2,
  they rated the original better in case 4, and the other cases ties.
- The revision wrote 57 NOTE findings in total. The original wrote 47.

Case 4 is the only case with a repeated difference. All 26 case-4 runs gave
`READY` and passed 5/5.

- Over 13 trials each, the revision added a NOTE beyond the expected
  `docs/labels.md:3` NOTE in 8 runs. The original did this in 3 runs.
- 6 revision runs and 2 original runs raised an acceptance-rule NOTE. The
  NOTE says that the plan does not make `node scripts/check.mjs` a pass/fail
  gate when Node is present. Graders call it grounded, but it disputes the
  plan's statement that review is sufficient acceptance.
- v3 restores two phrases of the original, but the difference stays. In the
  same batch, v3 raised the acceptance-rule NOTE in 3 of 6 runs, and the
  original in 2 of 6.

The final chat message also differs. Both variants often report more than
the verdict, the counts, and the `EVALUATION:` line. Cases 1–6, 10, and 11
give 41 runs per variant. The final message had more than 40 words in 30
revision runs and in 23 original runs. In case 5, the revision summarized
the findings in 4 of 4 runs, and the original in 0 of 4. The
`general-purpose` role also asks for a summary, so this result is
harness-sensitive.

Mean tokens per run were up to 2.2k higher for the revision. Mean time was
up to 12 s longer. The runs in each batch were concurrent, so do not infer a
latency or token change.

### Limits and artifacts

Each case has one to six trials per candidate. These are observations, not
proof of equivalence. The NOTE and final-message differences are within a
range that more trials can confirm or remove.

The graders suggested stricter checks:

- An assertion for the `docs/labels.md:3` NOTE (case 4).
- An assertion that fails a report that disputes review-only acceptance
  (case 4).
- A rule for a NOTE that repeats a BLOCKING root cause (case 2).
- A check that no subject reads the decoy plan (case 8).
- An assertion for the minimal final message (all cases).
- A fixture with a git baseline, or a plan without "Review the diff"
  (cases 1, 6, 10, and 11).

These checks were not added, so the recorded scores stay comparable with
2026-09-20. The suite gaps from 2026-09-20 still apply.

Local snapshots, per-run repos and outputs, final responses, transcripts,
timings, integrity scripts, and grades are under the ignored sibling
directory:

`plan-evaluate-workspace/2026-09-24/`

`skill-a/` is the original, and `skill-b/`, `skill-c/`, and `skill-d/` are
v1, v2, and v3. `iteration-3-case4-notes.json` and
`iteration-4-case4-notes.json` classify every case-4 finding. Open
`review/final/index.html` to compare v3 with the original and leave
feedback. `review/iteration-1/` and `review/iteration-2/` hold the v1 and v2
comparisons. `old_skill` in the benchmarks means the original skill, not no
skill.

## 2026-09-20 revision

### Scope

On 2026-09-20, compare the original skill with the revised skill on all
11 fixtures. Also compare a compression-only candidate on cases 1–3.
Each completed trial used a fresh `general-purpose` subagent, an isolated
fixture copy, and `cliproxyapi/gpt-6-astra` with xhigh thinking.

These are single-trial observations, not proof of equivalence. The parent
graded report content and inspected tool calls and file inventories.
Grading was neither blind nor independent.

### Size

Whitespace-delimited word counts include frontmatter and the required format.
Fixtures are not part of the runtime instructions.

| Version | SKILL.md | Output format | Combined |
|---|---:|---:|---:|
| Original | 1,067 | 432 | 1,499 |
| Compression only | 627 | 432 | 1,059 |
| Revised, including correctness fixes | 815 | 437 | 1,252 |

The shipped skill is 23.6% shorter. The combined instructions are 16.5%
shorter. All report section headings, table layouts, and finding fields remain.
The format now permits missing/invalid plan status and empty/non-plan failure.

### Observations

| Configuration | Cases | Passed assertions |
|---|---:|---:|
| Revised | 11 | 47/47 |
| Original | 11 | 42/47 |
| Compression only | 3 | 14/14 |

- The revised reports preserved the expected verdicts and blocking root causes
  across all fixtures. Every revised run preserved its repository inputs.
- The original returned `READY` for the empty plan, with zero checked claims
  and steps. The revised skill correctly returned `NOTHING EVALUATED`.
- Both original and revised runs handled planned scripts, the false premise
  in Settled Decisions, explicit supersession, missing inputs, and unsafe
  helper inspection. These runs do not establish gains on those cases.
- Three original runs wrote beside the plan instead of at the explicit target,
  citing a checkout restriction without a demonstrated write denial.
  The general-purpose role supplies checkout instructions, so this result is
  harness-sensitive. It is not evidence of a sandbox denial or a proven causal
  benefit from shortening.
- The compression-only report for case 2 added a public-formatter validation
  NOTE. Its verdict and two blocking roots matched the original. The shipped
  revised report matched the original finding levels and counts on cases 1–3.
- Both case-4 reports found a legitimate unrelated stale prose-prefix issue.
  Its expected-output narrative was corrected to allow evidence-backed notes.
  The assertions and trial inputs were not changed.

### Limits and artifacts

One initial revised case-1 attempt produced no completed result and later
reported a disappeared pane. The user identified the stalled attempt.
The parent requested interruption and ran a fresh replacement, which passed.
The incomplete attempt is preserved and excluded from scores.

Runs occurred concurrently, and completion durations include substantial
launch/provider delays. Do not infer a latency improvement from these timings.
Word reduction is not a measured reduction in total model usage.

The suite does not exercise implicit newest-directory selection, unreadable
files, denied output writes, every invalid status value, or secret redaction.
Normal output structure was checked, but generic role summary instructions
mean the trials do not establish exact final-message minimalism.

Local snapshots, raw reports, completion records, tool-call transcripts,
integrity inventories, grades, and the static review viewer are under the
ignored sibling directory:

`plan-evaluate-workspace/2026-09-20/`

The revised and original comparison is in `review/benchmark.json`.
The compression-only comparison is in `review/compression-benchmark.json`.
Open `review/index.html` to compare the outputs and leave feedback.
`without_skill` in the benchmark means the original skill, not no skill.
