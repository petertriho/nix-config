# Planner readability revision results

## Scope

On 2026-09-24, compare the original skill with a readability revision on all
6 fixtures. The revision applies ASD-STE100 and write-better rules. It keeps
every rule, the frontmatter description, the plan section names, and the
output strings `PLAN:`, `Status:`, and `Blockers: None`.

Each trial used a fresh `general-purpose` subagent, an isolated fixture copy,
and `claude-opus-5-5`. One `general-purpose` grader subagent per case graded
both variants with the skill-creator grader instructions and `facts.json`.
The grader saw the variant names, so grading was not blind.

These are single-trial observations, not proof of equivalence.

The trials used an earlier scratch script. `prepare.py` reproduces its
fixture bytes, HEAD commits, prompts (after `{skill}` substitution), and
assertions exactly. This was checked for all 12 runs.

## Size

Whitespace-delimited word counts include frontmatter.

| Version | SKILL.md |
|---|---:|
| Original | 942 |
| Revised | 1,148 |

The revision is 21.9% longer. STE keeps articles and complete grammar, and it
gives one instruction per sentence. That causes most of the growth.

## Observations

| Configuration | Cases | Passed assertions |
|---|---:|---:|
| Revised | 6 | 40/40 |
| Original | 6 | 39/40 |

| Case | Revised | Original |
|---|---:|---:|
| 1 First question, Claude Code | 7/7 | 7/7 |
| 2 First question, no question tool | 5/5 | 5/5 |
| 3 Early stop, `Draft` | 9/9 | 9/9 |
| 4 Complete interview, `Ready` | 7/7 | 7/7 |
| 5 Explicit revision with `TASKS.md` | 8/8 | 8/8 |
| 6 Native plan mode active | 4/4 | 3/4 |

- Integrity matched in every pair. No run changed source files or made a
  commit. `TASKS.md` (case 5) and the `notes-export` plan (case 4) stayed
  byte-identical. Every saved plan had the expected status and all ten
  sections in order. Every final response had a `PLAN:` line with an
  absolute path.
- In case 6, the original failed one assertion. While plan mode was active,
  its message also invited export details: "tell me anything you already
  know about the export". The grader called this borderline. One trial does
  not establish a gain.
- In case 4, the revised run named its directory `csv-export`. The original
  added a suffix to the existing name: `notes-export-2`. Both left the
  existing plan unchanged. The grader rated the revised plan slightly higher,
  because it read the existing Markdown plan and confirmed that the commands
  do not clash.
- In case 3, both runs kept the unanswered `--query` recommendation out of
  Settled Decisions. The revised plan labeled it "(not approved)" directly.
  Its Handoff Notes called step 4 unblocked, but step 4 depends on blocked
  step 2. The original gave more implementation detail.
- In case 5, both runs edited the plan in place, kept Peter's note word for
  word, and named T1 and T2 as invalidated. Both flagged the tags format and
  the formula guard as unapproved defaults. The revised plan also listed
  both as open questions. Both added some scope that the user did not
  request, for example a BigQuery acceptance load and the deletion of
  `src/csv.mjs`.
- In cases 1 and 2, both variants asked one grounded question with a
  recommendation. The only difference was the option wording.

| Case | Revised time | Original time | Revised tokens | Original tokens |
|---|---:|---:|---:|---:|
| 1 | 35.3 s | 33.3 s | 25,999 | 24,713 |
| 2 | 31.9 s | 30.1 s | 24,866 | 23,956 |
| 3 | 113.0 s | 129.9 s | 37,533 | 40,146 |
| 4 | 139.6 s | 114.1 s | 40,098 | 37,262 |
| 5 | 185.4 s | 141.5 s | 46,149 | 40,629 |
| 6 | 28.5 s | 29.0 s | 21,893 | 21,738 |

## Limits and artifacts

All 12 runs occurred concurrently. Do not infer a latency or token change
from one trial per variant.

Most assertions check preserved behavior, so they do not separate the
versions. The graders suggested stricter checks:

- No further question after "write it up" (cases 4 and 5).
- A directory name that describes the goal (case 4).
- Decisions that nobody discussed stay out of Settled Decisions (case 3).
- The revision reaches Proposed Approach, Implementation Plan, and
  Validation, not only Settled Decisions (case 5).
- No code reads before the plan-mode stop (case 6).

These checks were not added, so the recorded scores stay comparable.

The suite does not exercise denied writes, failed save verification, a
revision without `TASKS.md`, or exploration of a large codebase with a
subagent. Some subjects read files outside `repo/`, for example their own
prompt file. No assertion depends on this.

Local snapshots, per-run repos and outputs, timings, `facts.json`, grades,
and the benchmark are under the ignored sibling directory:

`planner-workspace/iteration-1/`

That directory uses the scratch-script layout: `prompt.txt` and
`fixture_manifest.json` instead of `run.json`, and slightly different
`facts.json` field names. The original skill is in
`planner-workspace/skill-snapshot/SKILL.md`. The comparison is in
`iteration-1/benchmark.json`. Open `iteration-1/review/index.html` to
compare the outputs and leave feedback. `old_skill` in the benchmark means
the original skill, not no skill.
