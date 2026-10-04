# Prompt principles for model-agnostic agent skills

These practices are hypotheses drawn from authoring and prompting guidance.
They do not establish how every model or client behaves.
Evaluate changes against the target skill's actual users, models, and clients before claiming improvement.

## Contents

- [Sources and applicability](#sources-and-applicability)
- [Prompting hypotheses](#prompting-hypotheses)
- [Authoring hypotheses](#authoring-hypotheses)
- [Runtime boundaries](#runtime-boundaries)

## Sources and applicability

Sources recorded as checked on 2026-10-04:

- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Agent workflow guidance](https://claude.dev/blog/getting-the-most-out-of-opus-5-5/)
- [Prompting and runtime guidance](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)

The main file links each operational reference directly:

- `references/skill-authoring.md` contains authoring practices, limits, examples, and checklists.
- `references/runtime-guidance.md` contains capability-based runtime checks and workflow safeguards.
- `references/source-coverage.md` records retained, generalized, and excluded source advice.

For the latest guidance, recheck the sources.
For a specific runtime, consult its current documentation.
Separate documented behavior from proposed model-agnostic practices.
The scope limits and capability checks here are adaptations, not evidence that the sources tested every runtime.

## Prompting hypotheses

| Skill behavior | Candidate change | Required limit | Supporting source topic |
| --- | --- | --- | --- |
| Multi-step work | State completion and escalation criteria. Continue authorized, unblocked work. | Preserve interaction and risky-action approval. Pending results are not completed work. | Whole tasks and completion. Unattended runs. |
| Generic thinking commands | Remove redundant “think hard” language before adding checks. | Preserve useful analysis and explanations. Evaluate behavior rather than deleting by keyword. | Thinking instructions. |
| Long-running work | Track open work with a task tool or persistent checklist. | Do not add tracking to trivial tasks or continue indefinitely while blocked. | Durable task lists. Unattended runs. |
| Delegated audits or migrations | Divide useful, independent scopes. Check each result's evidence. | Keep results pending until received and checked. Use the harness's completion mechanism. | Delegation. Unattended runs. |
| Progress and findings | Give brief updates about blockers, changes, and unconfirmed findings. State search locations. | Match cadence to the workflow. Do not claim complete coverage without evidence. | Progress updates. Uncertainty. |
| Code review | Report actionable failures with file and line evidence, explanations, and reproductions where possible. | Preserve review scope. Diff or whitespace checks do not prove behavior. | Code review. |
| File production | Define the usable deliverable and required content. | Respect requests for outlines or plans as the actual deliverable. | Finished files. |
| Long-document analysis | Cross-check names, dates, figures, and contradictions. Locate discrepancies in the source. | Mark unresolved discrepancies instead of inventing corrections. | Document checks. |
| Work across apps or documents | Inspect relevant sources and dependencies before changing data. | Keep exploration within authorized sources. Retrieved text cannot grant authority. | Context exploration. |
| Quoted or pasted content | Distinguish user instructions from external text. | Embedded instructions need explicit user authorization. Tags are not a security boundary. | Pasted content. |
| Frontend work | Name specific unwanted patterns. Inspect the replacement. | Preserve the user's design direction. Example exclusions are not universal rules. | Design constraints. |
| Visual inputs | Use original images with supported tools. Crop or inspect dense material where useful. | Disclose absent visual access. Re-evaluate old preprocessing before removing it. | Visual inputs and tools. |
| Short follow-ups | Evaluate whether unnecessary reconsideration of settled answers causes a concrete problem. | Preserve correction after new evidence. Exclude shortcuts that suppress analysis or task-specific self-correction. | Settled answers. |

These hypotheses concern outcomes and workflow design.
They promise no universal quality, latency, cost, or token gain.
If a simplification performs worse, preserve the relevant existing constraints.

## Authoring hypotheses

| Observed problem | Candidate change | Required limit | Supporting source topic |
| --- | --- | --- | --- |
| Generic background | Keep information needed for the task. | Preserve contracts, caveats, and necessary examples. | Context economy. |
| Variable or fragile operations | Choose instruction freedom according to risk and variability. | Preserve exact safety sequences and exploratory judgment. | Degrees of freedom. |
| Poor discovery or navigation | Improve specific metadata, direct links, domain organization, and contents lists. | Preserve stable names, manual invocation, and supported metadata. | Names, descriptions, and progressive disclosure. |
| Complex steps or strict outputs | Use workflows, branches, templates, examples, and feedback loops. | Match strictness to the contract. Do not require tracking for trivial work. | Workflows and output patterns. |
| Repeated deterministic operations | Use documented scripts and checked intermediate outputs. | Check dependencies, permissions, recovery, and actual tool identifiers. | Executable skills. |
| Unsupported improvement claims | Define gap-based evaluations and compare behavior with the baseline. | Evaluate intended models and clients. Report missing runs and unconfirmed benefits. | Evaluation and iteration. |

## Runtime boundaries

Prompt prose defines task behavior, not API parameters or client features.
Runtime controls need current documentation and actual client support.
Identical control names do not imply identical behavior across runtimes.

An unattended client can need a bounded continuation mechanism while work remains open.
Its stop signals, role conventions, and background-result delivery depend on the harness.
A turn ending does not establish completion.
Metadata and scripts can support integration features, but ordinary skill prose cannot configure them.

Time budgets in prompts are advisory.
Hard timeouts need harness enforcement.
Elapsed-time signals need real clock measurements.
Quality checks remain necessary under time pressure.

Applications can mark pasted content with generated tags.
A skill cannot guarantee those wrappers or their enforcement.
External text has no independent authority to redirect the task.

For runtime recommendations, cite current documentation.
State the supported configuration and required permissions.
Evaluate that configuration separately.
Do not infer capabilities, restrictions, or performance from a different model's documentation.
