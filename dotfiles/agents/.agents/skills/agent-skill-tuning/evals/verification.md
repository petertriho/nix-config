# Portability verification

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
