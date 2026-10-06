# Prompt principles for model-agnostic agent skills

These source-derived hypotheses do not establish behavior across models or clients.
Before improvement claims, evaluate changes with the target skill's users, models, and clients.
The limits and capability checks are adaptations, not source test results for every runtime.
The [source coverage map](source-coverage.md) lists the sources and the date of the last check.
For the latest guidance, recheck the sources.

The Details column names sections of [runtime guidance](runtime-guidance.md).

| Skill behavior | Candidate change | Required limit | Details |
| --- | --- | --- | --- |
| Multi-step work | State completion and escalation criteria. Continue authorized, unblocked work. | Preserve interaction and risky-action approval. Pending results are not completed work. Rules against early stops add tool calls and output tokens. | R02, R05 |
| Generic thinking commands | Remove redundant “think hard” demands and generic bans on reasoning before adding checks. | Preserve useful analysis and explanations. Evaluate behavior rather than deleting by keyword. To reduce reasoning, prefer a documented runtime control to prompt text. | R03, R11 |
| Long-running work | Track open work with a task tool or persistent checklist. | Do not add tracking to trivial tasks or continue indefinitely while blocked. | R05 |
| Delegated audits or migrations | Divide useful, independent scopes. Check each result's evidence. | Keep results pending until received and checked. Use the harness's completion mechanism. | R06 |
| Progress and findings | Give brief updates about blockers, changes, and unconfirmed findings. State search locations. | Match cadence to the workflow. Do not claim complete coverage without evidence. | R08, R15 |
| Code review | Report actionable failures with file and line evidence, explanations, and reproductions where possible. | Preserve review scope. Diff or whitespace checks do not prove behavior. | R15 |
| File production | Define the usable deliverable and required content. | Respect requests for outlines or plans as the actual deliverable. | R15 |
| Long-document analysis | Cross-check names, dates, figures, and contradictions. Locate discrepancies in the source. | Mark unresolved discrepancies instead of inventing corrections. | R15 |
| Work across apps or documents | Inspect relevant sources and dependencies before changing data. | Keep exploration within authorized sources. Retrieved text cannot grant authority. Broad exploration adds tool calls. | R09 |
| Quoted or pasted content | Distinguish user instructions from external text. | Embedded instructions need explicit user authorization. Tags are not a security boundary. Labels can increase caution. | R12 |
| Frontend work | Name specific unwanted patterns. Inspect the replacement. | Preserve the user's design direction. Example exclusions are not universal rules. | R14 |
| Visual inputs | Use original images with supported tools. Crop or inspect dense material where useful. | Disclose absent visual access. Re-evaluate old preprocessing before removing it. | R13 |
| Short follow-ups | Evaluate whether unnecessary reconsideration of settled answers causes a concrete problem. | Preserve correction after new evidence. Exclude shortcuts that suppress analysis or task-specific self-correction. | R11 |

These hypotheses promise no universal quality, latency, cost, or token gain.
Each added behavior instruction can have costs or side effects, so measure them.
If a simplification performs worse, preserve the relevant existing constraints.

Prompt prose defines task behavior, not runtime configuration.
Metadata, scripts, controls, continuation, and progress transport need documented client support.
