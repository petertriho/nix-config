# Integration verification

Checked 2026-10-04. This records source coverage and regression evidence,
not a claim of improvement across models.

## Source coverage

- Read all three primary pages, including code blocks, examples, tables, and caveats.
- Cross-checked their live HTML headings and code blocks.
- The code-block counts matched: authoring 37, Blog 6, Docs 9.
- No live tabs or expandable sections hid additional advice.
- Inspected all three authoring diagrams.
- Retained 76 mapped source entries and 42 baseline-preservation entries in
  `references/source-coverage.md`.
- An independent full-source audit found six fidelity issues.
  Corrected every issue and the corresponding coverage rows.
- The independent recheck returned PASS with no remaining substantive omission,
  inaccuracy, or safeguard regression.

The source map distinguishes primary-source coverage from linked supplemental documentation.
It also records safety qualifications, client-specific applicability, and corrected example interpretation.

## Structural checks

- Main file: 153 total lines, below the 500-line recommendation.
- Frontmatter parsed with PyYAML and a duplicate-key check.
- Stable name and `disable-model-invocation: true` preserved.
- Description: 457 characters, within the documented 1,024-character limit.
- All 57 local Markdown links and anchors resolved.
- All four operational references linked directly from `SKILL.md`.
- Every reference longer than 100 lines had a contents list.
- All 11 unique external links returned HTTP 200.
- Evaluation JSON parsed with nine unique cases and existing input files.
- Original cases 1–5 remained unchanged.
- Original report fixture remained byte-for-byte unchanged.
- All 13 original hypothesis rows and the original runtime summary remained exact.
- Original scope and decision-rule sections remained exact.
- Active LSP checks on six changed instruction/reference/JSON files found no diagnostics.
- `git diff --check` passed.

## Actual using-agent trials

Ran three matched tasks with the old skill and three with a frozen revised candidate:

| Case | Task | Result |
| --- | --- | --- |
| 4 | Tune only a disposable report-skill copy | Both preserved output, evidence, source protection, and publishing approval. |
| 3 | Audit the interactive quiz without edits | Both rejected unattended continuation and preserved the deliberate learner wait. |
| 6 | Audit the authoring fixture without execution | The revised run covered all checked authoring points with reference provenance. |

Runtime-reported model: `cliproxyapi/gpt-6.1-sol`, thinking `xhigh`.
Client: pi coding agent. Exact client version and underlying provider mapping were unverified.
Both configurations used the same tasks, model selection, client, and tool restrictions.

The revised outputs passed 20 descriptive assertions.
The baseline passed 18 and did not supply the documented API-container constraint
or client-qualified MCP naming advice. It still preserved the safety boundaries.
The generic safety assertions passed on both versions and do not demonstrate added value.

The revised batch reached its turn limit after cases 4 and 3.
A continuation completed only case 6.
The candidate snapshot preceded later source-fidelity corrections.
The final files received separate structural checks and the independent source recheck.

## Limits and evidence location

The actual trials exercised the tuning skill, not downstream report generation,
quiz conversations, API containers, or MCP execution.
Only one using-agent trial per case and configuration was run.
The trials were not blinded, and each version used a shared session for its cases.
No Haiku, Sonnet, Opus, multi-client, latency, or cost comparison was performed.
Manual scenario reviews remain distinct from actual using-agent work.

Repository inputs remained unchanged during trials.
No fixture code, migration, publication, external record access, or dependency
installation was performed by the using agents.

Temporary source snapshots, baseline copies, checks, graded outputs, and the static
review page are under `/tmp/agent-skill-tuning-baseline.ILerVD/`.
That directory is temporary and is not part of the installed skill.
