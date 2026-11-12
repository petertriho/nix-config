# Client guide incorporation: 2026-11-12

This change adds the portable lessons of a fourth primary source, the [client best practices](https://code.claude.com/docs/en/best-practices) guide.
It claims no measured cross-model, cost, or latency improvement.

## Changes

- R17 separates model-judged guidance from harness enforcement. It keeps skill rules and puts enforcement in runtime suggestions.
- R18 adds the five preflight questions for unattended runs, limits for scripted runs, and a small pilot first.
- R01–R06, R11, and R15 add usage checks, checkpoint gaps, spec interviews, effort reports, obsolete workarounds, resent history, delegation costs, scope statements, check evidence, and spec-based review.
- A01, A05, A09–A11, A14, A21, A23, and A24 add the discoverability test, manual invocation for side effects, the release example, exact check commands, stale-instruction checks, causes of missed rules, CLI pointers, and tool-server context cost.
- Five prompt-principles rows are new, and three rows have added limits.
- The main workflow adds a filter for reviewer findings, a ban on repository facts, a rule for missed rules, a limit for evaluation runs, and command evidence in reports.
- The coverage map adds the source, its reading evidence, a 32-row topic table, and its exclusions.
- Evals 10–12 and the `enforcement-skill.md` fixture are new.

The evaluation-run limit addresses an observed failure.
On 2026-10-06, nested eval 4 runs started 48 and 42 model runs without a cost limit.

## Baseline and size

The baseline is the clean working tree at commit `2584a1ddb42862b533585b294a81cf4c64ec6271`.
Temporary copies came from that commit with `git archive`.

| Instructional file | Lines before | Lines after | Words before | Words after |
| --- | ---: | ---: | ---: | ---: |
| `SKILL.md` | 125 | 131 | 1,005 | 1,096 |
| `references/prompt-principles.md` | 32 | 37 | 565 | 795 |
| `references/runtime-guidance.md` | 354 | 541 | 2,041 | 3,904 |
| `references/skill-authoring.md` | 551 | 628 | 3,224 | 3,954 |
| `references/source-coverage.md` | 170 | 224 | 2,120 | 3,229 |
| **Total** | **1,232** | **1,561** | **8,955** | **12,978** |

Counts come from `wc`. They are not model-token counts.
The growth is source content, mostly in references that load on demand.

## Structural checks

- All 108 relative links and their anchors resolve.
- `yq` parses the frontmatter. The name, the description, and manual invocation are unchanged.
- All A01–A24 and R01–R18 headings are in order.
- Each reference longer than 100 lines has a contents list.
- `evals.json` parses. Evals 1–9 and both earlier fixtures are byte-identical to the baseline.
- Added lines contain no em dashes, semicolons, or contractions.
- No added prose sentence has more than 25 words.

## Behavioral comparisons

Each run used a fresh Claude Code general-purpose subagent with the model of this session, `claude-opus-5-5`.
The revision was copied without `evals/` to `/tmp/ast-x/`, and the baseline to `/tmp/ast-y/`.
Fixtures were copied to `/tmp/ast-fixtures/`.
Prompts were identical except for the skill path.
Each run was read-only and could not start subagents, model runs, or web fetches.
The run limit was six runs, one for each case and version.

| Case | Revision | Baseline |
| --- | ---: | ---: |
| Eval 10: enforcement and repository-fact audit | 13/13 | 10/13 |
| Eval 11: bounded comparison plan | 10/10 | 9/10 |
| Eval 12: reviewer findings and delegation | 6/7 | 7/7 |

Partial passes count as misses.

- Eval 10 baseline misses: it kept the discoverable layout lines, called removal of capitals optional, and did not propose manual-only invocation for the release.
- Eval 11 baseline miss: it did not name hooks, ambient instructions, or installed skills among the fixed or recorded conditions.
- Eval 12 revision miss: it said that a second review adds independence, but it did not say why a fresh reviewer helps. The baseline said to give the reviewer the file without the earlier conclusions.

The eval 10 revision run argued that manual-only invocation for the whole fixture would stop its `.env` and formatter rules from loading.
After that run, the eval 10 expectation changed to manual-only invocation for the release workflow, for example in a separate skill.
Both runs were graded against the changed expectation.

The revision runs used R17, R18, A01, and the R15 reviewer filter in their outputs.
The eval 11 revision plan set a 32-run ceiling and asked before it would exceed that ceiling.
The baseline plan proposed up to 60 runs.

## Evidence limits

Each configuration ran once per case.
The editor of this change wrote evals 10–12 and graded the outputs, and grading was not blinded.
One client and one model configuration ran.
No latency, cost, token, or cross-model claim follows from these runs.
The linked pages of the new source remain unread.
No runtime configuration, installed skill, or unrelated file changed.

# Source recheck and gap fixes: 2026-10-06

This change adds six unrecorded source points, clarifies three instructions, and removes duplication.
It claims no measured cross-model or cost improvement.

## Changes

- A05 and A24 require third-person descriptions. The main description now uses “Preserves.”
- A09 moves large workflows into linked files.
- R05 adds completion conditions, continuation messages, a separate checker model, and the two-or-three continuation example.
- R03, R11, and the prompt-principles table cover generic bans on reasoning and documented reasoning controls.
- R05, R09, R12, and the prompt-principles table record the costs and side effects of added instructions.
- The coverage map excludes the claim that models know the skill format natively.
- The main check step requires fresh contexts and states both scenario minimums in one place.
- The main editing step states that its rule list applies to the run and, where needed, to targets.
- One repeated evidence warning, the prompt-principles index sections, and three duplicate source lists were removed.
- The baseline preservation map moved here from the source coverage map.
- The historical portability record is shorter.
- The report fixture no longer asks for private chain of thought. Evals 4 and 5 now name the remaining generic commands to think hard.

## Baseline and size

The baseline is the clean working tree at commit `3435b0048c990e4e3942a030f4fd063ec30e5f8b`.
Temporary copies for the runs came from that commit with `git archive`.

| Instructional file | Lines before | Lines after | Words before | Words after |
| --- | ---: | ---: | ---: | ---: |
| `SKILL.md` | 122 | 125 | 948 | 1,005 |
| `references/prompt-principles.md` | 74 | 32 | 738 | 565 |
| `references/runtime-guidance.md` | 327 | 354 | 1,781 | 2,041 |
| `references/skill-authoring.md` | 543 | 551 | 3,140 | 3,224 |
| `references/source-coverage.md` | 199 | 170 | 2,451 | 2,120 |
| **Total** | **1,265** | **1,232** | **9,058** | **8,955** |

Counts come from `wc`. They are not model-token counts.

## Structural checks

- All 87 relative links and their anchors resolve.
- A YAML parser reads the frontmatter: the name is unchanged, the description has 337 characters, and manual invocation remains.
- The main body has 119 lines.
- All A01–A24 and R01–R16 headings remain in order.
- Each reference longer than 100 lines has a contents list.
- The prompt-principles table keeps all 13 rows.
- `evals.json` parses. Seven evaluations and the authoring fixture are byte-identical to the baseline.
- Added lines contain no em dashes, semicolons, or contractions.

## Behavioral comparisons

Each run used a fresh Claude Code general-purpose subagent.
Safeguard errors from that configuration named `claude-opus-5` as the API model.
Both skill versions were copied without `evals/` to neutral paths, `/tmp/ast-x/` (baseline) and `/tmp/ast-y/` (revision).
Fixtures were copied to `/tmp/ast-fixtures/`.
Prompts were identical except for the skill path and the disposable directory.

| Case | Baseline | Revision |
| --- | --- | --- |
| Eval 4: authorized report-skill edit | 11/11 expected items | 11/11 expected items |
| Eval 5: read-only reasoning-control audit | 5/5 expected items | 5/5 expected items |
| Eval 6: read-only authoring audit | 17/17 expected items | 17/17 expected items |

Eval 4 counts include the partial-output and final-preservation checks from the 2026-10-05 record.

Only the revision used the new rules in its output:

- In eval 6, it proposed a third-person description and fresh-context evaluations against the saved original.
- In eval 5, it cited the documented reasoning control, warned that less reasoning can lower quality, and proposed fresh-session comparisons.

In eval 4, both versions started nested model runs on three Claude models without asking.
The baseline run used 48 nested runs, and the revision run used 42.
The skill sets no cost limit for evaluation runs.

The first eval 4 and eval 5 runs read a fixture that asked for private chain of thought.
A `reasoning_extraction` safeguard flag stopped three of those four runs.
No run was retried and no model changed to avoid the safeguard.
The user then removed that request from the fixture, and all four reruns completed.

## Evidence limits

Each configuration ran once per case.
The editor of this change graded the outputs, and grading was not blinded.
One client and one model configuration ran.
No latency, cost, token, or cross-model claim follows from these runs.
One nested run in the revision's eval 4 wrote a scratch file outside its folder. That run's agent reports that it deleted the file.
No runtime configuration, installed skill, or unrelated file changed.

# Baseline preservation map

This table maps the skill's baseline requirements to their current destinations.
It moved from the source coverage map on 2026-10-06 because it records this skill's history, not guidance for target skills.

| Baseline requirement | Retained destination |
| --- | --- |
| Existing-skill tuning, stable identity, manual invocation, bounded scope, and justified no-edit results | Main introduction, frontmatter, scope, and workflow |
| Purpose, trigger, outputs, supported clients, safety, and useful analysis | Main scope and editing step |
| Applicable references before review, not checklist-only edits | Main navigation and justified-edit step |
| Maintained source resolution, not generated or read-only copy edits | Main scope |
| Audit-only means no edits or unrelated configuration changes | Main scope |
| Documented runtime controls or explicit uncertainty | Main scope, R03–R04, R08 |
| Higher-priority instructions and untrusted-source boundaries | Main scope, R09, R12 |
| Read targets, references, tests, local guidance, and working-tree changes | Baseline step |
| Save originals and preserve uncommitted changes | Baseline step |
| Current behavior, proposed change, expected benefit, check, and source evidence | Justified-edit step |
| Small edits and no filler replacements for thinking commands | Justified-edit and editing steps |
| Preserve frontmatter, formats, links, approvals, interaction, and analysis | Editing step |
| No generic continuation or reduced-thinking instruction | Editing step |
| Diff, frontmatter, links, tests, and normal versus stop scenarios | Check step |
| Matched configuration, disposable copies, quality first, and preservation of unrelated changes | Check step |
| Structural, manual, and actual-run evidence remain separate | Reporting step |
| Tested configuration, missing runs, and no unmeasured cross-model gains | Reporting step |
| Blockers first and separate runtime suggestions | Reporting step, R15 |
| Completion without losing destructive, irreversible, external, or out-of-scope approval | Main scope and editing step, R02, R05 |
| Usable artifacts unless the user requested an outline or plan | Editing-step rules for the run and targets, R15 |
| Background work pending until checked, except explicit launch-only requests | Editing step, R05–R06 |
| Observable rationale and evidence, not private reasoning requests | Editing step, R04, R11 |
| Useful task tracking and supported delegation with checked evidence | Editing step, R05–R06 |
| Uncertainty and source locations without invented findings | Reporting step, R15 |
| Prompt text does not configure runtime features | Main scope, prompt principles, and the runtime-guidance introduction |
| All 13 prompting hypotheses and their operational limits | Prompt-principles table |
| Source rechecks and documented behavior separate from adaptations | Prompt-principles introduction and source coverage map |
| Runtime summaries | R03–R13, R16 retain only portable checks and limits. Exact controls and model claims are excluded. |
| Nine evaluation cases and their underlying safety or evidence scenarios | All nine cases remain. Evals 4 and 5 name generic commands to think hard since 2026-10-06. |
| Intentional fixture defects and required approvals | Both fixtures keep their defects and approvals. The report fixture lost its private chain-of-thought request on 2026-10-06. |

# Simplification verification: 2026-10-05

The simplification removes repeated instructions and applies the supplied ASD-STE100 writing guidance.
It preserves the source inventory, examples, safety conditions, and evaluation expectations.

## Baseline and size

The baseline is the clean working tree at commit `8eb0f59d9f055aaaa10b7fa460df0f5eda87f7d9`.
Originals and local evidence remain outside installed skill directories in `.pi/agent-skill-tuning-muul0bxi/`.
That ignored workspace contains checks, preservation reviews, trial snapshots, transcripts, and outputs.

Counts use whitespace-separated words, including headings, tables, and examples.
They are not model-token counts.
The instructional total excludes fixtures, evaluation data, and this verification record.

| Instructional file | Before | After |
| --- | ---: | ---: |
| `SKILL.md` | 1,357 | 948 |
| `references/prompt-principles.md` | 965 | 738 |
| `references/runtime-guidance.md` | 1,877 | 1,781 |
| `references/skill-authoring.md` | 3,495 | 3,140 |
| `references/source-coverage.md` | 2,441 | 2,451 |
| **Total** | **10,135** | **9,058** |

The main word count decreased by 30.1%.
The main file decreased from 197 to 122 lines.
Total instructional words decreased by 10.6%.
No text moved to a new instructional reference.

## Structural and manual evidence

- All 208 structural checks passed, including 88 relative links and their applicable anchors.
- Frontmatter, all 13 prompting hypotheses, five authoring fences, and 65 authoring inline-code spans remain unchanged.
- All A01–A24 and R01–R16 headings remain in order.
- All nine evaluations and both inert fixtures remain byte-identical to the baseline.
- The manual coverage review covers all nine evaluation expectations.
- Independent reviews found six compressed statements with changed or unclear meanings. Each received a correction.
- The prose scan found no prohibited mechanical patterns. The three longest counted sentences contain 19, 18, and 18 words.
- The writing review preserves technical distinctions, instruction strength, and one primary action per procedure step.
- Active LSP probes found no diagnostics in the six changed Markdown files.

The constrained frontmatter parser covers the scalar syntax present here, not general YAML.
Word counts treat code, quotations, and parenthetical text as single units for sentence-length checks.
The existing software-domain term “check” remains consistent.
Full dictionary compliance needs the official dictionary and is not certified.

## Behavioral comparisons

Three matched cases compare the revised and original skills in fresh contexts.
The configured model is `cliproxyapi/gpt-6-astra`, with `xhigh` reasoning, in Pi 1.0.1.
Each pair has identical task text, inputs, model, reasoning level, client, and 26 exposed tool names.
Artifact paths differ by disposable run directory.

Iteration 2 passed all 29 assertions per configuration.
Independent grading still found less explicit partial-input handling, a missing final source-integrity check, and weaker final-only audit delivery.
It also found less explicit advice about descriptive reference filenames.
The revisions add focused checks for these gaps.
These local findings remain separate from primary-source attribution.

Iteration 3 restored partial-report handling and complete final audits.
Its report edit still omitted the final source-integrity check.
The final clarification requires that check **inside the target skill**, not only during the tuning audit.
Iteration 4 reran the affected report-edit pair.

The final evidence set combines that pair with iteration 3's clarification and read-only audit pairs.
Those earlier snapshots remain unchanged.
Their only later instruction change concerns emission of the protected-input check during target edits.
Exact allowed-diff checks enforce that limited difference.
The clarification stops before edits, and the authoring audit is read-only.

The final grading includes four additional quality assertions.
Both configurations run without the earlier artificial 24-turn cap.
No maintained evaluation expectation or fixture changed.

| Case | Revised | Original |
| --- | ---: | ---: |
| Bounded scope and required question | 3/3 | 3/3 |
| Authorized report-skill edit | 14/14 | 12/14 |
| Read-only authoring audit | 16/16 | 16/16 |
| **Total** | **33/33** | **31/33** |

The original report-edit run missed the two added partial-output and final-preservation checks.
Both configurations passed every original assertion.
The final revised output passed all added checks, with no remaining regression found against the tested requirements.
The lead reviewed final artifacts, responses, command bodies, and preservation evidence.
Earlier independent grading informed the corrections.
Grading was not blinded.

Local review artifacts:

- `.pi/agent-skill-tuning-muul0bxi/review.html`: generated review page with outputs and benchmark results.
- `.pi/agent-skill-tuning-muul0bxi/final-review/benchmark.json`: assertions, timing, token counts, and limits.
- `.pi/agent-skill-tuning-muul0bxi/final-review/`: original snapshots, transcripts without private reasoning, outputs, grades, and comparisons.

## Evidence limits

Structural checks and manual review do not establish model behavior.
These actual trials exercise tuning, not downstream report generation, publication, migrations, or multiple runtimes.
Each final case has one run per configuration.
Statistics across different cases do not estimate repeated-trial variance.
Reported tokens include repeated context and cache reads, not only new output.
No general speed, token-use, or cost benefit is established.
Task tools create internal harness metadata, not edits to protected user files.
The source URLs remain exact, but no new external-source audit or availability check ran.
No runtime configuration, installed skill, fixture, external record, or unrelated file changed.
No latency, cost, universal quality, or cross-model improvement claim follows from shorter instructions.

# Historical portability verification

This record summarizes the earlier portability rewrite, not later changes.
Its counts, file inventory, and trial limits are historical.
It claims no measured behavioral or performance improvement.

- The rewrite replaced the model-specific reference with `references/runtime-guidance.md`.
  It kept the skill's name, manual invocation, output contracts, approvals, deliberate stops, and source boundaries.
- The working tree was clean before editing.
  Original files were saved in the temporary directory `/tmp/agent-skill-tuning-baseline.AplDPI/`.
- The coverage map started to separate retained, generalized, and excluded advice.
  Operational text replaced model-specific assumptions with capability checks.
  Model or vendor names remained only inside the exact source URLs.
- Structural checks passed on all nine maintained files.
  They covered frontmatter, names, manual invocation, 59 relative links and anchors, contents lists, section order, source URLs, evaluation JSON, code fences, and the 13 prompting hypotheses.
- Manual reviews aligned all nine evaluation expectations with the rewritten instructions.
  They did not run the tuning workflow or show downstream behavior.
- No new model trials ran for the rewrite.
  An earlier trial on one runtime reported 20 candidate and 18 baseline assertions on three matched tasks.
  That trial used one run per case, was not blinded, and preceded later source corrections.
  It does not establish the rewritten skill's behavior or gains across models or clients.
