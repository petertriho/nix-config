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

The remaining record describes the earlier portability rewrite, not the current simplification.
Its counts, file inventory, and trial limits are historical.

This record separates checks of the model-agnostic rewrite from historical source and trial evidence.
It claims no measured behavioral or performance improvement.

## Scope and baseline

The rewrite covers `SKILL.md`, four references, evaluation data, two fixtures, and this verification record.
The working tree was clean before editing.
Original files were saved outside installed skill directories at `/tmp/agent-skill-tuning-baseline.AplDPI/`.
That directory is temporary and is not an installed resource.

The rewrite keeps the skill's name and manual invocation.
It retains output contracts, approval, deliberate stops, source boundaries, and checks of pending work.
The model-specific reference is replaced by `references/runtime-guidance.md`.

## Source treatment

The three original source URLs remain with neutral labels.
Model or vendor names inside those exact URLs are the only exception to the naming restriction.
Operational text uses capability checks instead of model-specific assumptions.

The coverage map distinguishes retained, generalized, and excluded advice.
Excluded material includes named-model comparisons, version-specific integration behavior, exact vendor controls, and fallback instructions.
Source attribution does not establish that advice works on every model or client.

The previous verification record reports full primary-source reads on 2026-10-04.
It includes code blocks, live HTML headings, and three authoring diagrams.
It reports matching code-block counts: authoring 37, workflow article 6, prompting guide 9.
It also reports an independent source audit and recheck after six fidelity corrections.

Those are historical records, not new source reads.
The portability rewrite uses the saved files and coverage inventory.
No current HTTP availability or full-source revalidation claim follows from those records.

## Structural and prose checks

Checks passed on all nine maintained files:

- Frontmatter uses supported scalar syntax with no duplicate keys.
- Skill and fixture names remain unchanged.
- Each frontmatter retains `disable-model-invocation: true`.
- The main file has 197 total lines.
- Its description has 336 characters, within the reference's 1,024-character limit.
- All 59 relative Markdown links and anchors resolve.
- All four operational references link directly from `SKILL.md`.
- Every reference longer than 100 lines has a contents list.
- All A01–A24 and R01–R16 sections exist in order.
- All three exact source URLs remain with neutral labels.
- No named-model or vendor reference remains outside those URLs.
- No model-specific filename or stale reference remains.
- Evaluation JSON parses with the same schema, nine unique IDs, and unchanged input paths.
- Every evaluation input file exists.
- All five fenced authoring snippets match the saved baseline.
- The fixture's Python fragment matches the saved baseline.
- All 13 prompting hypotheses remain with their limits.
- Prose scans found no contractions, unapproved modals, semicolons, em dashes, or perfect-tense patterns outside code.
- The three longest prose sentences contain 20, 20, and 19 words.
- Procedures use one primary action per sentence and place conditions before commands.
- Verification terminology uses “check,” and runtime settings use “configuration.”
- Active LSP probes and `git diff --check` supplement these structural checks.

Frontmatter checks use a constrained parser for the files' plain, quoted, and Boolean YAML scalars.
They do not claim general YAML-parser coverage.
Word counts treat code, titles, quotations, and parenthetical text as single units under the supplied writing rules.

## Manual scenario reviews

Manual reviews compare the rewritten instructions with the preserved contracts and revised evaluation expectations.
They do not run the tuning workflow or demonstrate downstream behavior.

All nine evaluation expectations align with the rewritten instructions:

| Case | Manual finding | Instruction evidence |
| --- | --- | --- |
| 1 | Suggestions-only review preserves scope and safety without file changes. | Main scope and opportunity step. |
| 2 | An unbounded request triggers a question before edits. Runtime equivalence needs evidence. | Main scope. |
| 3 | Interactive teaching retains deliberate waits, not unattended continuation. | Main decision rules and R05. |
| 4 | Report completion requires the usable file and evidence. Publication approval remains separate. Delegated results remain pending. | Main editing and check steps, decision rules, R02, R05, and R15. |
| 5 | Prompt text cannot configure undocumented runtime controls or guarantee faster replies. Useful analysis remains. | Main reporting and decision rules, R03, and R11. |
| 6 | Authoring defects need concrete findings without script execution, installation, or automatic renaming. | Main scope and audit lenses, A04, A08–A10, A16–A17, and A20–A23. |
| 7 | Source incorporation inventories examples and caveats, preserves safeguards, and records exclusions. Links alone are insufficient. | Main candidate step and source coverage map. |
| 8 | Restricted runtimes need available dependencies, visible errors, supported tool identifiers, and approved execution. | A17, A20–A23, and main scope. |
| 9 | Shorter text and one configuration do not establish cross-model gains. Missing runs and navigation observations remain explicit. | Main check and reporting steps, A03, and A13–A15. |

Both fixtures retain their intentional defects and required approvals.
The report fixture remains a report-producing target, not an audit-only skill.

## Actual model runs

No new using-agent trials, paid model comparisons, or broad benchmarks ran for this rewrite.
Editing agents reviewed files, not evaluation tasks.
Their work does not count as using-agent trial evidence.

The previous record describes three matched tasks using an older baseline and candidate.
It reports 20 candidate assertions and 18 baseline assertions.
Both configurations preserved safety boundaries.
The candidate covered two authoring points that the baseline missed.
Generic safety assertions passed on both and did not show added value.

Historical trial limits:

- The trials used one runtime, not several models or clients.
- Exact client version and underlying provider mapping were unconfirmed.
- Each configuration used one trial per case.
- Trials were not blinded.
- Each version shared one session across its cases.
- A turn limit interrupted the candidate batch before a continuation finished the remaining case.
- The candidate snapshot preceded later source-fidelity corrections.
- Trials exercised tuning, not downstream reports, teaching conversations, restricted containers, or MCP execution.
- No latency or cost comparison ran.

Model-specific identity is omitted from this portable record.
These historical results do not establish the rewritten skill's behavior.
They also do not establish gains across models or clients.

## Limits

Structural checks and manual reviews cannot establish actual model behavior.
Shorter text does not establish better quality, lower latency, or lower cost.
Full ASD-STE100 dictionary compliance needs the official dictionary and is not certified here.
The writing pass checks the supplied skill's structural rules and preserves technical terms.

No fixture code, migration, publication, external-record change, or dependency installation is part of these checks.
