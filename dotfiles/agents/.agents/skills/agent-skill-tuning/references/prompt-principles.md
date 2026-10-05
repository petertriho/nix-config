# Prompt principles for model-agnostic agent skills

These source-derived hypotheses do not establish behavior across models or clients.
Before improvement claims, evaluate changes with the target skill's users, models, and clients.

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

For the latest guidance, recheck the sources.
For a specific runtime, consult its current documentation.
Separate documented behavior from proposed model-agnostic practices.
The scope limits and capability checks here are adaptations, not evidence of source tests on every runtime.

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

These hypotheses promise no universal quality, latency, cost, or token gain.
If a simplification performs worse, preserve the relevant existing constraints.

## Authoring hypotheses

The directly linked `references/skill-authoring.md` supplies the authoring checks and limits:

- A01–A02: Useful task context and instruction freedom appropriate to risk.
- A04–A08: Discovery and navigation without unauthorized identity or invocation changes.
- A09–A12: Workflows, feedback, terminology, templates, and examples appropriate to the contract.
- A17–A23: Deterministic scripts, intermediate outputs, recovery, dependencies, permissions, and supported tools.
- A03, A13–A15: Gap-based evaluations, baseline comparisons, navigation observations, and feedback.

Use A24 as the final checklist.

## Runtime boundaries

Prompt prose defines task behavior, not runtime configuration.
Metadata, scripts, controls, continuation, and progress transport need documented client support.
Identical control names do not establish identical behavior.

The directly linked `references/runtime-guidance.md` contains the detailed checks:

- R03–R08: Configuration, integration, bounded continuation, delegation, safeguards, and progress delivery.
- R10: Advisory budgets, real elapsed-time measurements, harness-enforced timeouts, and quality under time pressure.
- R12: Application-generated wrappers that neither guarantee enforcement nor authorize external instructions.

For recommendations, cite current documentation and required permissions.
State the supported configuration.
Evaluate the supported configuration separately.
Do not infer capabilities, restrictions, or performance from another model's documentation.
