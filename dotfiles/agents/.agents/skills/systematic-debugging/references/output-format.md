# `DEBUG.md` Output Contract

Use this contract for every new or resumed investigation. `DEBUG.md` is a live
diagnostic notebook, not an implementation plan. Keep the headings in the
template below, in order, so another investigator can resume without relying on
conversation history.

## Contents

- [Required vocabulary](#required-vocabulary)
- [Completion rules by status](#completion-rules-by-status)
- [Conditional-section rule](#conditional-section-rule)
- [Live-update rules](#live-update-rules)
- [Final-normalization rules](#final-normalization-rules)
- [Copy-ready template](#copy-ready-template)

## Required vocabulary

The `Status` field must be exactly one of:

- `IN PROGRESS` — investigation is active, evidence is incomplete, or cleanup
  proof is still pending.
- `CONFIRMED` — a direct trace or discriminating test establishes one or more
  causal factors and their chain to the behavior, and plausible competing
  explanations that could invalidate that chain have been addressed. An
  unresolved additional factor is compatible only when it cannot invalidate
  an asserted `CF#` or change the corrective direction.
- `PROBABLE` — evidence strongly favors one causal explanation or set, but the
  decisive trace or test is unavailable or unsafe. The missing decisive
  evidence must be named.
- `UNRESOLVED` — no responsible leading cause is supported, or the next safe
  test is blocked by missing access, data, reproduction, or authorization. The
  exact uncertainty or blocker must be named.

Every hypothesis `State` must be exactly one of:

- `untested` — no discriminating result has been collected.
- `supported` — evidence is consistent with the causal claim but does not yet
  establish it.
- `contradicted` — evidence weakens the claim but does not conclusively rule it
  out.
- `disproved` — discriminating evidence rules out the causal claim under the
  tested conditions.

Do not use alternate status or hypothesis labels.

Every final `CF#` finding must use exactly one causal role:

- `trigger` — the event or transition that started this occurrence;
- `causal factor` — a defect or condition whose correction would prevent
  recurrence in the same way;
- `contributing condition` — a condition that increased likelihood;
- `impact amplifier` — a condition that increased severity, scope, or duration;
- `detection gap` — a condition that delayed or prevented discovery; or
- `response gap` — a condition that delayed or complicated containment or
  recovery.

A trigger is not automatically a causal factor. Do not use “human error,”
“operator mistake,” “the team forgot,” or similar blame labels as causal roles
or terminal technical explanations.

## Completion rules by status

| Status | Outcome content | Corrective handoff | Next diagnostic action |
| --- | --- | --- | --- |
| `IN PROGRESS` | Current evidence, uncertainty, blockers, and working hypotheses; do not state final causal findings | Prohibited | Required: the next safe, discriminating action |
| `CONFIRMED` | Confirmed causal set and chain, competing explanations, and causal-role findings; do not state that the issue is fixed | Required: smallest justified direction, regression-test target, validation expectations, non-goals, and an implementation prompt | `Not applicable` with the reason that the diagnosis is confirmed |
| `PROBABLE` | Leading causal explanation or set and the exact missing decisive evidence; causal factors remain unconfirmed | Prohibited | Required: the next discriminating evidence-gathering action |
| `UNRESOLVED` | Exact uncertainty or blocker; do not promote a weak candidate to a causal finding | Prohibited | Required: the next safe action, or the access/authorization needed to make one possible |

For a production incident, any status may also include reversible containment
advice in the dedicated incident section. Containment is not a corrective
handoff, a causal correction, authorization, or permission to execute a
change.

## Conditional-section rule

Never silently omit a top-level (`##`) heading from the template.

- When a conditional section does not apply, write
  `Not applicable — <specific reason>.` under its top-level heading. This
  explicit replacement may stand in for that section's subordinate headings,
  fields, and tables only when no append-only historical record exists.
- If a section becomes inapplicable after records were created, state its
  current `Not applicable` or `Not established` disposition and retain the
  earlier rows under a clearly labeled `Historical superseded records`
  subsection. Conditional normalization never authorizes deleting history.
- When a conditional section does apply, complete every shown field and table;
  do not remove inconvenient rows.
- When a required fact is not yet known, write
  `Unknown — <how it will be determined or what blocks it>.`
- During an active investigation, work not yet performed may be marked
  `Pending — <next action>.`
- Do not use `Not applicable` merely because evidence was not gathered.
- At final normalization, replace every placeholder and `Pending` entry with
  evidence, an explicit blocker or limit, or `Not applicable` plus a reason.

## Live-update rules

1. Create the notebook immediately with `Status: IN PROGRESS`. If resuming an
   explicitly named notebook, preserve its existing evidence and history.
2. Update `Last updated` and `Next Diagnostic Action` after every meaningful
   observation, hypothesis test, epoch transition, observability-integrity
   check, authorization decision, probe change, cleanup action, independent
   review, or blocker.
3. Give evidence (`E#`), hypotheses (`H#`), system-model steps (`S#`),
   fundamental-premise checks (`F#`), investigation epochs (`EP#`),
   observability-integrity checks (`OI#`), final causal findings (`CF#`), and
   Git bisection sessions (`GB#`) stable IDs. Append new records; do not
   renumber earlier records.
4. Record corrections by marking an earlier interpretation, `S#`, `F#`, `EP#`,
   `OI#`, or `CF#` row as superseded, linking the replacement ID, and citing
   the replacing evidence. Do not erase contradictory results, disproved
   hypotheses, model revisions, premise-check transitions, authorization
   history, or cleanup history.
5. Separate observations from interpretations. A command or query without its
   result and interpretation is not an evidence entry.
6. Use timestamps with an explicit timezone. Record enough command/query
   context to reproduce the observation without including secrets.
7. Redact credentials, secrets, keys, tokens, personal data, and sensitive
   payloads before writing. Record what class of data was redacted and whether
   the redaction limits interpretation.

## Final-normalization rules

Before reporting a final outcome:

1. Keep every top-level (`##`) template heading in order and remove all
   instructional placeholders. Conditional subordinate content may be replaced
   only by an explicit `Not applicable` statement under its top-level heading.
2. Preserve the complete useful evidence trail, including results that oppose
   the final conclusion.
3. Ensure every conclusion cites evidence IDs and every hypothesis has a result
   or an explicit reason it remains `untested`.
4. Tag each evidence result with its `EP#`. For a Git-bisection result, also
   cite its `GB#` and tested commit. For material telemetry evidence, cite an
   `OI#` record whose limits are compatible with the claim.
5. Apply the status-specific rules above. Only `CONFIRMED` may contain a
   corrective implementation direction.
6. Keep factual incident impact and chronology separate from causal diagnosis
   and advisory containment.
7. Preserve every stateful-probe authorization request and decision separately
   from actual probe lifecycle and cleanup records. Keep lifecycle and cleanup
   as distinct records. A pending, denied, or withheld/not-approved request
   remains part of the notebook even when no probe was introduced.
8. Compare final repository/project state with the initial state and record
   proof that no investigation-owned probe edit, temporary file, worktree, or
   bisect state remains. Never claim clean completion when cleanup cannot be
   proved.
9. For `CONFIRMED`, record one or more evidence-backed `CF#` causal factors
   without forcing a single root cause. Preserve triggers, contributing
   conditions, impact amplifiers, detection gaps, and response gaps as distinct
   roles when supported. If current status or evidence no longer permits a
   `CF#` or `OI#` finding, retain its superseded history beside the current
   `Not established` or `Not applicable` disposition.
10. When a human action is material, describe the contemporaneous information,
    constraints, system or process conditions, and safeguards without
    speculating about intent or using blame as diagnosis.
11. Replace every unused conditional section with `Not applicable` and a
   specific reason.
12. Record the notebook's exact absolute path in Case Metadata; the final
    response must report that same absolute path.

## Copy-ready template

````markdown
# Debug Investigation: <concise case title>

## Case Metadata

| Field | Value |
|---|---|
| Case name | `<kebab-case case name>` |
| Status | `IN PROGRESS` |
| Mode | `development` \| `CI/build` \| `integration` \| `performance` \| `flaky/concurrency` \| `production incident` |
| Scope | <affected behavior, component, service, or workflow and explicit exclusions> |
| Artifact path | `<absolute path to this DEBUG.md>` |
| Local project/repository root | `<absolute path>` or `Not applicable — <reason>` |
| Created | `<YYYY-MM-DD HH:MM:SS timezone>` |
| Last updated | `<YYYY-MM-DD HH:MM:SS timezone>` |
| Notebook lifecycle | `new case` \| `resumed explicitly named artifact` |
| Issue source | <user report, CI failure, alert, ticket, or other source; redact sensitive identifiers> |

## Failure Frame

### Expected Behavior

<Specific observable behavior that should occur. Distinguish stated
requirements from investigator assumptions.>

### Actual Behavior

<Specific observed behavior, including complete error/stack-trace location or
an evidence ID. Do not substitute an interpretation for the observation.>

### Scope and Frequency

| Field | Value |
|---|---|
| Affected environment | <environment identity without secret values> |
| Affected surface | <users, requests, commands, tests, components, or data path> |
| Onset | <first known occurrence or `Unknown — <reason>`> |
| Frequency | <always, intermittent rate, one occurrence, or `Unknown — <reason>`> |
| Known recent changes | <factual changes with evidence IDs, or `Unknown — <reason>`> |
| Facts supplied at start | <facts only> |
| Initial interpretations | <claims clearly labeled as interpretations, or `Not applicable — none supplied`> |

## Incident Impact and Timeline

<!-- Conditional: complete for production incidents. Otherwise write one
line: Not applicable — this investigation is not a production incident. -->

| Impact field | Value |
|---|---|
| Severity | <declared severity and source; do not invent one> |
| Affected users/systems | <factual affected population or systems> |
| Impact | <observable service, safety, financial, or data effect> |
| Detection source | <alert, report, metric, log, or other source> |
| Incident start | <timestamp or `Unknown — <reason>`> |
| Current incident state | <ongoing, contained, recovered, or unknown; factual only> |

| Time and timezone | Epoch | Source | Factual event or observation | Scope | Evidence reference | Fact quality | Observed impact |
|---|---|---|---|---|---|---|---|
| <exact or bounded time> | <EP#> | <alert, log, metric, trace, report, or other source> | <what happened; no causal inference> | <affected boundary> | <E#> | `direct` \| `reported` \| `sampled` \| `inferred` | <impact at that time, or `Unknown — <reason>`> |

## Investigation Epochs

Start `EP1` from the initial baseline. Add an epoch when a material artifact,
configuration, environment, dependency, workload, operational action, probe,
or telemetry condition changes how later evidence must be interpreted. Do not
create a new epoch for an unchanged stateless repetition. IDs follow discovery
order, not necessarily chronology; append a stable new ID when earlier state is
discovered later. `Chronological predecessor` means the state immediately
before this epoch in event time, not the previous numeric ID. If that
predecessor is learned later, append a superseding epoch record rather than
rewriting history. Git-bisect revision changes are nested under `GB#` within one
enclosing epoch. Create another epoch during bisection only when a non-revision
condition changes.

| ID | Start and end | Chronological predecessor | Effective artifact, configuration, environment, and load | Material transition from predecessor | Observed change provenance and authority | Evidence comparability | Evidence or revision link |
|---|---|---|---|---|---|---|---|
| EP1 | <start; end or `current`> | <EP#, `None — earliest known state`, or `Unknown — <gap>`> | <relevant effective state; for bisection use `revision varies under GB#` and keep all non-revision conditions explicit> | <specific transition in event time, `Initial observed baseline`, or `Unknown — <gap>`> | <automation/service/change role and sanitized audit reference, or `Unknown`; use a neutral alias only when authorized and needed for correlation> | <epochs and claims this state can be compared with, or `Pending — baseline only`> | <E#; `current` or `superseded by EP#`> |

## Initial Repository and Environment State

### Repository or Project Baseline

| Field | Initial value |
|---|---|
| Version control | <system and availability, or `Not applicable — <reason>`> |
| Initial reference/commit | <branch/tag and immutable revision, or `Not applicable — <reason>`> |
| Initial worktree/project status | <exact summarized result and evidence ID> |
| Initial Git bisect state | <inactive, active session details and source if known, or `Not applicable — not Git`> |
| Protected pre-existing dirty paths | <exact paths, or `Not applicable — no pre-existing dirty paths`> |
| Relevant untracked paths | <paths and why relevant, or `Not applicable — none identified`> |
| Baseline command/query | <command/query plus working directory/context, or `Not applicable — <reason>`> |
| Baseline result | <exit status/result and interpretation> |

### Environment Baseline

| Field | Value |
|---|---|
| OS and architecture | <value and evidence source> |
| Runtime/toolchain versions | <relevant versions and evidence source> |
| Dependency/build/deployment identity | <lock/build/image/release identity, or `Not applicable — <reason>`> |
| Configuration source | <source and relevant non-secret shape; never secret values> |
| Relevant feature/settings state | <redacted summary and evidence source, or `Not applicable — <reason>`> |
| Access and safety constraints | <read-only limits, missing access, or other constraints> |

## System Model and Fundamental Checks

Append a new `S#` or `F#` row when evidence changes the model or premise state.
Keep the earlier row and mark it `superseded by <ID>` with an `E#` citation.

### Intended Path

| ID | Step or boundary | Expected responsibility, transformation, or contract | Effective identity or provenance | State or revision link | Evidence |
|---|---|---|---|---|---|
| S1 | <entry point, component responsibility, state transition, or boundary contract> | <expected behavior or contract> | <source, artifact, runtime, manifest, or configuration source> | `verified` \| `assumed` \| `unknown` \| `superseded by S#`; <reason or gap> | <E#> |

### Fundamental Premises

Check only premises relevant to the case. Include the actual execution target,
invocation context, artifact identity, input, effective configuration,
permissions, resource availability, connectivity, clock assumptions, and
observation scope as applicable.

| ID | Premise | Expected state | Observed effective state | Evidence or provenance | State or revision link | Interpretation |
|---|---|---|---|---|---|---|
| F1 | <specific premise required for the observed path or investigation> | <expected state> | <observed state, or `Unknown — <reason>`> | <E# or source> | `verified` \| `contradicted` \| `unknown` \| `superseded by F#` | <effect on reproduction, system model, or hypotheses> |

## Observation Integrity and Perspectives

### Black-box and White-box Comparison

<!-- Complete when an internal observation or multi-component path supports a
material claim. Otherwise write:
Not applicable — no distinct white-box observation was relevant or safely
available; <effect on confidence>. -->

| Behavior or boundary | Epoch, operation, cohort, and window | Black-box observation | White-box observation | Alignment limits or discrepancy | Evidence |
|---|---|---|---|---|---|
| <external contract, caller, or user-visible behavior> | <EP# and matched identity/time scope> | <actual external result> | <internal runtime state from logs, metrics, traces, profiles, effective configuration, or component diagnostics> | <correlation, sampling, retry, fan-out, queueing, clock, or coverage limits; state the observed discrepancy> | <E# and OI# where telemetry-derived> |

### Telemetry Integrity

<!-- Complete for every log, metric, trace, alert, dashboard, or profile source
that currently supports a material claim. If no `OI#` record ever existed,
write:
Not applicable — no telemetry-derived evidence supports a material claim.
If earlier `OI#` records exist but none currently supports a material claim,
write that current disposition and retain the rows below under
`Historical superseded records`. -->

| ID | Signal and intended claim | Target identity and scope | Definition, query, filters, and time semantics | Collection, sampling, retention, and blind spots | Independent cross-check | Disposition | Evidence or revision link |
|---|---|---|---|---|---|---|---|
| OI1 | <signal/source and exact claim it could support> | <artifact/service/path/cohort> | <unit/event meaning, safe query shape, aggregation, window, timezone, and delays> | <sampling, drops, buffering, rollups, resets, expiry, missing series, or `None known`> | <other source/E# or `Unavailable — <reason>`> | `trusted for claim` \| `limited` \| `unusable` | <E#; `current` or `superseded by OI#`> |

## Reproduction

**Disposition:** `reproduced` \| `intermittent` \| `unavailable` \| `unsafe`
\| `production-only`

**Disposition rationale:** <why this classification is justified; cite evidence
IDs. If reproduction was not attempted, state the safety, access, or
availability reason.>

| Attempt | Epoch and time/environment | Safe command or action and context | Controlled inputs | Expected result | Actual result/exit | Failure-signature match | Repeatability and interpretation | Evidence |
|---|---|---|---|---|---|---|---|---|
| R1 | <EP#, time, and environment> | `<command/query/action>` in `<working context>` | <inputs/variable held constant> | <discriminating expectation> | <observed output summary and exit/result> | <same defining signature, different failure, or not applicable; explain> | <what this establishes and does not establish> | <E#> |

## Component Boundaries

<!-- Conditional: complete for multi-component paths or when ownership is
uncertain. Otherwise write one line: Not applicable — <specific reason>. -->

| Boundary | Epoch | Producer | Observed input | Consumer | Observed output | Evidence | Interpretation |
|---|---|---|---|---|---|---|---|
| B1 | <EP#> | <component> | <actual value/state/timing/control signal> | <component> | <actual value/state/timing/control signal> | <E# and OI# where telemetry-derived> | <where behavior first becomes incorrect, or what remains unknown> |

## Evidence Log

| ID | Epoch, revision context, and time | Source and context | Command, query, or observation | Result or exit status | Observability integrity | Interpretation | Hypothesis impact | Redactions |
|---|---|---|---|---|---|---|---|---|
| E1 | <EP#; for bisection also GB#/tested commit; time> | <file/service/environment and working/query context> | `<exact safe command/query>` or <direct observation> | <exit code, returned result, or observed state> | <OI# or `Not telemetry-derived`> | <what the result establishes, does not establish, and whether an earlier interpretation is superseded> | <supports/contradicts/disproves H# or neutral, with reason> | <class redacted and effect on interpretation, or `None`> |

### Git Bisection Record

<!-- Conditional: complete only when Git bisection was run. If it was requested
but not run, preserve the request and decision under Stateful Probe
Authorization and write:
Not applicable — Git bisection was not run because <reason and A#>.
If it was not requested, write:
Not applicable — Git bisection was not applicable because <specific reason>. -->

| ID | Enclosing epoch | Authorization | Isolated worktree and initial state | Verified good and bad endpoints | Predicate and exit mapping | Tested and skipped revisions | Result | Interpretation | Reset and cleanup proof |
|---|---|---|---|---|---|---|---|---|---|
| GB1 | <EP# with fixed non-revision conditions; list later EP# if those conditions changed> | <A#> | <path, starting ref/commit, clean status, and E#> | <good revision/E#; bad revision/E# with signature match> | <exact command or procedure; `0` good, `1-127 except 125` bad, `125` skip, other abort> | <`git bisect log` summary with each tested commit's E#> | <first-bad revision or unresolved range, with E#> | <how this localizes the change; state why it is or is not causal proof> | <`git bisect reset`, disposable-worktree cleanup, final-state checks, and C#/E#> |

## Hypothesis Ledger

| ID | Specific causal claim | State | Supporting evidence | Contradicting evidence | Discriminating test and expected observation | Result and interpretation | Remaining gap |
|---|---|---|---|---|---|---|---|
| H1 | <cause produces the observed behavior through a named mechanism> | `untested` | <E# or `None yet`> | <E# or `None known`> | <smallest one-variable test; explain how its outcomes distinguish this claim from alternatives> | <E# and interpretation, or `Pending — <next action>`> | <missing evidence, unsafe test, or `None`> |

## Independent Diagnosis and Reconciliation

<!-- Required for production incidents, cross-component failures,
flaky/timing/concurrency cases, performance regressions, and any case that
would otherwise be PROBABLE. If no trigger applies, write:
Not applicable — <why no mandatory trigger applies and direct evidence is
sufficient>. -->

### Review Conditions

| Field | Value |
|---|---|
| Trigger | <mandatory trigger> |
| Method | `independent read-only investigator` \| `contradiction-seeking fallback` |
| Evidence provided | <evidence IDs, relevant EP#/OI# records, black-box/white-box comparison, or bounded artifact sections> |
| Favored hypothesis withheld | <yes, or exact limitation> |
| Independence limitation | <none known, or why the fallback is not context-independent> |

### Independent Findings

| Candidate causal set | Cited evidence | Counter-evidence sought/found | Smallest discriminating test | Independent conclusion |
|---|---|---|---|---|
| <one or more causal factors and roles, not a certainty claim> | <E#> | <E# or missing evidence> | <read-only test> | <what the independent evidence supports and what remains uncertain> |

### Reconciliation

| Point | Main investigation view | Independent view | Resolving evidence | Reconciled result or remaining disagreement |
|---|---|---|---|---|
| <claim> | <view> | <view> | <E# or `None available`> | <agreement, resolved disagreement, or explicit uncertainty> |

## Outcome Classification

**Status:** `IN PROGRESS` \| `CONFIRMED` \| `PROBABLE` \| `UNRESOLVED`

**Fix state:** `not executed by this diagnostic workflow`

**Classification rationale:** <cite the evidence threshold satisfied and the
threshold not yet satisfied, if any.>

### Confirmed Causal Set and Chain

<!-- Required only for CONFIRMED. For every other status write:
Not established — <current uncertainty and evidence IDs>.
Do not add current `CF#` findings for a non-CONFIRMED status. If earlier `CF#`
records exist from a resumed or downgraded diagnosis, retain them below under
`Historical superseded records` with their supersession links. -->

<State one or more established causal factors and trace their chain to the
observed behavior. Do not force a single root cause. Cite evidence IDs and
compatible EP#/OI# records at each material link.>

| ID | Causal role | Specific condition or event | Mechanism and causal-chain position | Recurrence, likelihood, impact, detection, or response significance | Evidence | Uncertainty or revision link |
|---|---|---|---|---|---|---|
| CF1 | `trigger` \| `causal factor` \| `contributing condition` \| `impact amplifier` \| `detection gap` \| `response gap` | <precise finding, not a component or blame label> | <how it enters or affects the chain> | <why this role applies; for a causal factor, how correction would prevent recurrence in the same way> | <E#, EP#, and OI# where applicable> | <remaining limit, `None`, or `superseded by CF#` with E#> |

### Leading Explanation, Uncertainty, or Blockers

<!-- IN PROGRESS: current uncertainty/blockers. PROBABLE: leading explanation
and exact missing decisive evidence. UNRESOLVED: exact uncertainty or blocker.
CONFIRMED: write Not applicable — the causal set is established above. -->

<Status-appropriate content with evidence IDs.>

### Competing Explanations

For `CONFIRMED`, every alternative that could invalidate an asserted `CF#` or
causal-chain link must be `addressed`. An unresolved factor may be marked
`compatible additional factor` only when it can coexist with the confirmed
chain and cannot change the corrective direction. If a material invalidating
alternative remains plausible or untested, use `PROBABLE`.

| Candidate | Evidence considered | Disposition | Reason |
|---|---|---|---|
| <alternative cause or causal set> | <E#> | `addressed` \| `compatible additional factor` \| `remains plausible` \| `untested` | <why this does or does not invalidate CF# or change the corrective direction> |

### Human-Action Context

<!-- Complete only when a human action is material to a hypothesis or confirmed
causal chain. Otherwise write:
Not applicable — no human action is material to the diagnosis. -->

| Factual action | Information and constraints visible at the time | System, interface, automation, or process conditions | Expected and observed safeguards | Causal relevance and evidence | Unknowns excluded from the diagnosis |
|---|---|---|---|---|---|
| <what occurred without blame or inferred intent> | <contemporaneous evidence, not hindsight> | <conditions that shaped, permitted, propagated, or amplified the action> | <validation, review, isolation, warning, rollback, or other control> | <H#/CF# and E#; do not use “human error” as the mechanism> | <intent, competence, memory, or other unsupported assumptions> |

## Stateful Probe Authorization, Lifecycle, and Cleanup Proof

<!-- A stateful probe includes tracked source/test instrumentation and
stateful version-control operations such as revision switching, disposable
worktree creation, or Git bisection. Authorization decisions and actual probe
lifecycle are distinct records.
If no stateful probe was proposed, requested, authorized, or introduced,
replace Probe Authorization History, Probe Lifecycle, and Probe Cleanup Records
below with:
Not applicable — no stateful probe was proposed, requested, authorized, or
introduced.
Do not claim that read-only evidence was sufficient unless the evidence record
actually establishes that conclusion.

If authorization history exists but no probe was introduced—including when
approval is pending, denied, withheld/not approved, or approved but unused—
complete Probe Authorization History and replace both Probe Lifecycle and
Probe Cleanup Records with:
Not applicable — no probe was introduced because <authorization decision or
blocker, citing A#>.

Complete Probe Lifecycle only for a probe actually introduced after explicit
approval, and keep its cleanup actions and proof in Probe Cleanup Records.
Always retain and complete Final-State Comparison below. -->

### Probe Authorization History

Append a new row for every request and decision transition; do not overwrite a
pending or earlier decision. Only `approved` authorizes introduction of a
probe.

| Authorization | Probe request | Requested at | Decision source and time | Decision | Approved scope, conditions, or blocker | Resulting action |
|---|---|---|---|---|---|---|
| A1 | <exact files or revisions, isolated target, probe, reason, risk, and cleanup plan requested> | <time> | <user/source and time, or `Awaiting explicit decision`> | `pending` \| `approved` \| `denied` \| `withheld / not approved` | <approved limits, denial reason if supplied, or exact authorization blocker> | <probe not introduced, introduced as P#, or next safe read-only action> |

### Probe Lifecycle

| Probe | Authorization | Exact changed paths or repository state | Introduced time/action | Initial-state protection/isolation | Diagnostic purpose | Observation | Lifecycle state |
|---|---|---|---|---|---|---|---|
| P1 | <approved A#> | <paths, revisions, worktree, or bisect state> | <time and exact introduction action> | <clean at start or isolated location; cite baseline> | <single diagnostic question> | <E# or GB#> | `active` \| `removed` \| `cleanup blocked` |

### Probe Cleanup Records

| Cleanup | Probe | Required restoration | Cleanup action and time | Cleanup proof | Result |
|---|---|---|---|---|---|
| C1 | <P#> | <initial state to restore; cite baseline> | `<exact restoration command/action>` at <time>, or `Pending — <next action>` | <comparison result and E#, or exact blocker> | `pending` \| `proved removed` \| `cleanup blocked` |

### Final-State Comparison

| Check | Initial state | Final state | Command/query and result | Conclusion |
|---|---|---|---|---|
| Repository/project state | <baseline reference/E#> | <final summarized state/E#> | `<command/query>`; <exit/result> | <pre-existing work unchanged; investigation-owned edits removed; or exact blocker and paths> |
| Stateful version-control operations | <initial bisect/worktree state> | <final bisect/worktree state> | `<command/query>`; <exit/result> | <no investigation-owned state remains, or exact blocker> |
| Investigation temporary files | <none or baseline list> | <final list> | `<command/query>`; <exit/result> | <none remain, or exact leftovers> |

**Cleanup conclusion:** `proved clean` \| `cleanup blocked`. <Cite evidence
and list exact affected paths for any blocker. Do not claim clean completion
without proof.>

## Confirmed Corrective Handoff

<!-- Required only for CONFIRMED. For IN PROGRESS, PROBABLE, or UNRESOLVED
write: Not applicable — corrective direction is prohibited for <status>
outcomes. -->

### Smallest Corrective Direction

<Implementation-ready direction justified by the confirmed causal set and
chain. Do not implement it here and do not broaden it into unrelated
refactoring.>

### Regression-Test Target

<Public behavior, failure condition, and assertion that should fail before the
correction and pass afterward.>

### Validation Expectations

- <proof that the intended correction is present in the tested artifact and environment>
- <when safe, a controlled rerun of a representative reproducer under the same relevant conditions>
- <when replay is unsafe or production-only, a predeclared non-production or read-only acceptance signal and the reason replay is prohibited>
- <focused regression check proving the corrected causal path>
- <relevant broader regression check and any important tradeoff metric>

### Non-goals

- <behavior, component, or cleanup explicitly outside the correction>

### Ready-to-use Implementation Prompt

```text
Read <absolute path to this DEBUG.md>. Implement only the confirmed corrective
direction with the execute skill. Preserve the confirmed causal set and
diagnosis non-goals, add the named regression test, and run the listed
validation. Prove the correction is present. When a safe representative
reproducer exists, rerun it. Otherwise use the predeclared non-production or
read-only acceptance signal and preserve the reason replay is prohibited.
Never replay an unsafe or production-only failure. Claim the issue is fixed
only after the applicable evidence passes. Do not treat incident containment
advice as the permanent fix.
```

## Incident Containment

<!-- Conditional: production incidents only. May be completed for any status.
For non-incidents write:
Not applicable — this investigation is not a production incident.
For an incident with no responsible option, write:
Not applicable — no reversible containment option is supported by current
evidence; <reason>. -->

**Boundary:** Advisory and reversible only. This notebook does not authorize or
execute deployments, restarts, rollbacks, flag/configuration changes, data
mutations, or any other production change.

| Option | Evidence-based rationale | Expected blast-radius reduction | Scope and reversibility | Risks and side effects | Preconditions and authority | Rollback considerations | Post-action read-only observations | Relationship to diagnosis | Execution state |
|---|---|---|---|---|---|---|---|---|---|
| <conceptual containment option; omit mutation commands> | <incident fact or bounded assumption with E#> | <users, systems, failure mode, or load expected to be protected> | <what would change and why an authorized operator could reverse it> | <known and uncertain failure, function, data, or capacity risks> | <verification required and external operational owner who must decide> | <signals that require reversal and state that must be preserved> | <read-only signals to monitor; if performed elsewhere, cite actual E# observations or state unavailable> | <state explicitly that the option does not confirm or replace the causal findings> | `not executed by this diagnosis`; <external operator state if known, with E#> |

## Next Diagnostic Action

<!-- Required for IN PROGRESS, PROBABLE, and UNRESOLVED. For CONFIRMED write:
Not applicable — the causal chain is confirmed; implementation is a separate,
explicitly invoked workflow. -->

| Field | Value |
|---|---|
| Question to discriminate | <one unresolved causal question> |
| Smallest safe action | <read-only observation/test/query; no corrective experiment> |
| Expected outcomes | <how each result changes named hypotheses> |
| Required access/data/authorization | <requirement or `None`> |
| Safety constraints | <production read-only rule, redaction, or other boundary> |
| Blocker and owner | <exact blocker and who can resolve it, or `Not applicable — no blocker`> |

## Investigation Limits

- <scope not inspected, evidence unavailable, unsafe reproduction, sampling
  limit, access constraint, or deliberate v1 limitation and its effect on
  confidence>

## Redactions

| Evidence/location | Data class | Redaction or summarization | Effect on interpretation |
|---|---|---|---|
| <E# or section> | `credential` \| `secret` \| `key` \| `token` \| `personal data` \| `sensitive payload` | <what was removed or summarized without reproducing it> | <none, or the exact diagnostic limitation> |

<!-- If nothing required redaction, keep the heading and write:
Not applicable — no sensitive values were collected or written. -->
````
