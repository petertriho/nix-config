# Plan Evaluate revision results

## Scope

On 2026-09-20, compare the original skill with the revised skill on all
11 fixtures. Also compare a compression-only candidate on cases 1–3.
Each completed trial used a fresh `general-purpose` subagent, an isolated
fixture copy, and `cliproxyapi/gpt-6-astra` with xhigh thinking.

These are single-trial observations, not proof of equivalence. The parent
graded report content and inspected tool calls and file inventories.
Grading was neither blind nor independent.

## Size

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

## Observations

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

## Limits and artifacts

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
