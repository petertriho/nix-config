# Read-Only Production Incident Diagnosis

Use this guide whenever an investigation includes current production impact or
live production evidence. It narrows the general debugging process; it does not
grant incident-command or operational authority.

## Contents

- [Absolute production boundary](#absolute-production-boundary)
- [Keep three records visibly separate](#keep-three-records-visibly-separate)
- [Investigation epochs and concurrent changes](#investigation-epochs-and-concurrent-changes)
- [Safe observability practice](#safe-observability-practice)
- [Sensitive-data handling](#sensitive-data-handling)
- [Correlation is not causation](#correlation-is-not-causation)
- [Blameless analysis of human actions](#blameless-analysis-of-human-actions)
- [Mandatory independent diagnosis](#mandatory-independent-diagnosis)
- [Blockers and escalation](#blockers-and-escalation)
- [Completion check](#completion-check)

## Absolute production boundary

Production work under this skill is observation only.

Allowed activities are limited to authorized, read-only inspection of existing
logs, metrics, traces, deployment metadata, configuration metadata, health
state, and other already-collected evidence. Prefer approved observability
systems and read replicas over direct access to production hosts or primary
data stores.

The skill cannot authorize, execute, or direct an agent to execute:

- deployments, promotions, releases, or package changes;
- restarts, process recycling, failovers, scaling, or traffic-routing changes;
- rollbacks or roll-forwards;
- feature-flag, runtime, infrastructure, access, or configuration changes;
- writes, repairs, migrations, deletions, cache invalidations, queue
  acknowledgements, replays, retries, credential rotation, or any other data
  mutation;
- enabling new logging, tracing, profiling, debug modes, or instrumentation in
  production;
- synthetic load, fault injection, forced reproduction, or any probe that can
  change production behavior.

An operation is not safe merely because it is named `get`, `show`, `describe`,
`explain`, or `select`. If its read-only behavior, access scope, or production
cost cannot be established, do not run it. Record the blocker and escalate.

## Keep three records visibly separate

Do not mix incident facts, causal interpretation, and containment advice in one
narrative. Maintain three distinct notebook sections throughout the incident.

### 1. Factual incident state

Record observations without assigning cause:

- incident identifier and current owner, when supplied;
- detection time, detection source, and the timezone for every timestamp;
- impact start, recovery, and end times only when supported by evidence;
- affected user cohorts, tenants, regions, versions, services, dependencies,
  or data paths;
- observed symptoms and quantified impact, including the measurement source
  and its coverage or sampling limits;
- severity as assigned by the responsible incident process, plus who assigned
  it. If no authorized severity exists, record `Unassigned` rather than
  inventing one;
- current known state, known unknowns, and material evidence gaps.

Describe impact in observable terms such as request failure rate, latency,
missing events, or unavailable workflows. Do not put a suspected component or
change into the impact statement as though it were established fact.

Use the canonical
[`Incident Impact and Timeline`](output-format.md#incident-impact-and-timeline)
notebook table with one event per entry:

| Time and timezone | Epoch | Source | Factual event or observation | Scope | Evidence reference | Fact quality | Observed impact |
|---|---|---|---|---|---|---|---|
| Exact or bounded time | `EP#` | Alert, log, metric, trace, report, or other source | What was observed; no causal inference | Affected boundary | Evidence-log entry | `direct`, `reported`, `sampled`, or `inferred` | Impact at that time, or `Unknown — <reason>` |

Mark reported, approximate, sampled, delayed, or clock-uncertain events. When
sources disagree, preserve both timestamps and the discrepancy; do not silently
choose the one that best fits a hypothesis.

### 2. Causal diagnosis

Keep candidate causes and confidence separate from the incident timeline.
Diagnosis follows the normal hypothesis ledger and canonical outcomes:

- `IN PROGRESS` while evidence is still being collected;
- `CONFIRMED` only when a direct trace or discriminating test establishes the
  causal chain and addresses plausible alternatives;
- `PROBABLE` when evidence strongly favors a cause but a decisive test or trace
  is unavailable or unsafe;
- `UNRESOLVED` when no responsible leading cause exists or the next safe test
  is blocked.

Incident severity measures impact; it does not increase diagnostic certainty.
A high-severity incident may remain `PROBABLE` or `UNRESOLVED`.

For `PROBABLE`, name the missing decisive evidence. For `UNRESOLVED`, name the
exact access, retention, safety, reproduction, data, or authorization blocker.
Only `CONFIRMED` may contain a corrective implementation direction. Do not
force one initiating root cause. Record each established trigger, causal
factor, contributing condition, impact amplifier, detection gap, or response
gap separately.

### 3. Advisory reversible containment

Containment may appear for any incident outcome, including `PROBABLE` and
`UNRESOLVED`, but only as separately labeled advice for an authorized operator.
It is risk reduction, not diagnosis, a permanent fix, or permission to act.
The skill must not execute it.

Record each option independently with the canonical
[`Incident Containment`](output-format.md#incident-containment) notebook table:

| Option | Evidence-based rationale | Expected blast-radius reduction | Scope and reversibility | Risks and side effects | Preconditions and authority | Rollback considerations | Post-action read-only observations | Relationship to diagnosis | Execution state |
|---|---|---|---|---|---|---|---|---|---|
| Conceptual, reversible action; omit mutation commands | Incident fact or bounded assumption that motivates it | Users, systems, failure mode, or load expected to be protected | What would change and why an authorized operator could reverse it | New failure modes, degraded functions, data risks, or capacity effects | Verification needed and the operational owner who must decide | How the operator would recognize a need to reverse the containment and what state must be preserved | Read-only signals to monitor; if performed elsewhere, cite actual evidence or state that observations are unavailable | State explicitly that it does not confirm or replace the causal findings | `not executed by this diagnosis`; record externally reported or observed state separately |

If reversibility, scope, expected reduction, risks, or rollback considerations
cannot be stated, do not present the item as a containment option. Never move a
containment action into the causal-set or corrective-handoff section merely
because impact improved after an operator performed it; improvement is
evidence to assess, not automatic causal proof.

## Investigation epochs and concurrent changes

Start `EP1` from the first trustworthy incident baseline. Start a new epoch
when a deployment, configuration change, traffic shift, restart, failover,
scaling event, cache or queue action, dependency transition, containment
action, workload change, or telemetry change can alter later evidence.
If an earlier state is discovered later, append a new `EP#` with its actual
bounded time. Epoch IDs follow discovery order and must not be renumbered to
match chronology. Record the state immediately before each epoch as its
chronological predecessor. If later evidence changes that predecessor or
transition, append a superseding epoch record.

The diagnosis workflow records operational actions performed elsewhere; it
does not authorize or execute them. Record the automation or service, change
role or authority, and sanitized audit reference when available. Do not require
a person's name; use a neutral alias only when cross-event correlation is
necessary and authorized. If several material changes occur together, list all
of them and treat attribution as confounded until other evidence separates
them.

Tag every incident timeline and evidence entry with an `EP#`. Compare windows
across epochs only after showing that the changed conditions are irrelevant to
the claim. A recovery after an operator action belongs to a new epoch and does
not by itself prove the action or its presumed target was causal.

## Safe observability practice

Treat observability as another system whose identity and failure modes need
verification. For every telemetry source supporting a material conclusion,
record an `OI#` integrity check in `DEBUG.md`. Verify the target, event or
metric definition, query and filters, time semantics, collection path,
sampling, retention, ingestion delay, aggregation, and known blind spots.

Pair the black-box user or caller symptom with white-box internal observations
from the same epoch, operation or cohort, and time window when both are
available. Disagreement between those perspectives is evidence to investigate,
not a reason to discard one view.

### Logs

- Use existing logs through approved read-only interfaces.
- Start with the smallest relevant time window, service boundary, severity, and
  known-safe identifier. Expand only when the previous result justifies it.
- Prefer counts, grouped summaries, and sanitized fields over bulk exports.
- Treat log absence carefully: retention, sampling, buffering, parsing,
  ingestion loss, access filtering, and clock skew can all hide events.
- Treat absence as evidence only when the failing path was in collection scope
  and the `OI#` check shows that the event should have been retained.
- Do not enable log levels, request dumps, or additional collection in
  production.

### Metrics

- Record the metric definition, unit, aggregation, labels, query interval, and
  source. A chart screenshot without these is incomplete evidence.
- Compare the incident window with an appropriate nearby baseline while
  accounting for traffic, region, version, cohort, and seasonality.
- Inspect numerator and denominator where a rate is used. A changing
  denominator can create a misleading trend.
- Note scrape interval, rollups, missing series, resets, cardinality controls,
  and alert evaluation delay.
- Do not infer user impact from an internal resource metric without evidence
  connecting the two.

### Traces and request paths

- Use already-captured traces and sanitized correlation fields.
- Verify propagation across each relevant component boundary; do not assume a
  shared identifier proves that every event belongs to one causal chain.
- Account for sampling, dropped spans, retries, fan-out, asynchronous queues,
  baggage truncation, and clocks from different hosts.
- Summarize span relationships and timings rather than copying payloads,
  headers, or sensitive attributes into `DEBUG.md`.
- Do not turn on tracing, increase sampling, or attach a live debugger.

### Queries

Before each production query:

1. State the diagnostic question and which competing hypotheses its possible
   results would distinguish.
2. Confirm the interface and identity are explicitly read-only and
   least-privileged. Prefer an observability store, replica, approved export,
   or bounded snapshot.
3. Bound the time range, service, region, cohort, and fields to the minimum
   needed. Aggregate or sample before requesting row-level output.
4. Apply documented limits and pagination. Avoid unbounded scans, broad
   wildcard searches, high-cardinality joins, repeated polling, and bulk
   exports.
5. Check known cost or query-budget controls without executing an analysis mode
   that itself runs the workload. Do not continue if load, locking, latency, or
   side effects are uncertain.
6. Run one query at a time. Stop if the system reports throttling, elevated
   latency, lock risk, timeout pressure, or unexpected scope.
7. Record the sanitized query shape, target, time window, result, limitations,
   and hypothesis impact. Do not record credentials or raw sensitive results.

Do not run stored procedures, user-defined functions, administrative commands,
or query forms with unknown side effects. Never weaken tenant, privacy, or
authorization boundaries to make correlation easier.

## Sensitive-data handling

Collect the minimum evidence necessary. Sanitize before placing evidence in
chat, command output, screenshots, exports, or `DEBUG.md`; do not rely on a
later cleanup pass.

| Data class | Required handling |
| --- | --- |
| Secrets and credentials | Never copy passwords, private keys, certificates, connection strings, signing material, recovery codes, or secret environment values. Replace the whole value with a typed redaction marker. |
| Tokens and session material | Redact API tokens, OAuth codes, bearer tokens, session IDs, cookies, CSRF values, signed URLs, and authorization headers in full. Do not preserve prefixes or suffixes unless an approved system supplies a non-secret fingerprint. |
| Personal data | Minimize and aggregate names, email addresses, phone numbers, addresses, account identifiers, IP addresses, device identifiers, location, and other directly or indirectly identifying data. Use stable neutral aliases only when cross-event comparison is necessary and authorized. |
| Regulated or highly sensitive data | Do not copy financial, payment, health, biometric, authentication, private-communication, or similar protected content. Record only the sanitized property needed for diagnosis, such as type, presence, size class, or validation result. |
| Payloads and data records | Do not paste request or response bodies, message contents, database rows, uploaded files, query parameters, trace attributes, or headers. Prefer schema, field names, byte counts, digests from approved tooling, status classes, and redacted excerpts. |

Also inspect apparently harmless metadata: URLs, filenames, labels, exception
messages, stack locals, screenshots, correlation tags, and structured-log
fields can contain the same sensitive classes.

Use markers such as `[REDACTED:TOKEN]`, `[REDACTED:PERSONAL_DATA]`, and
`[REDACTED:PAYLOAD]`. Record what category was removed and whether redaction
limits the conclusion. If useful evidence cannot be handled within the
authorized data boundary, stop and escalate to the appropriate security,
privacy, or data owner rather than copying it.

## Correlation is not causation

Treat temporal proximity, shared identifiers, and co-moving charts as leads:

- A deployment before an alert does not establish that the deployment caused
  the incident.
- A saturated resource does not establish whether saturation is cause,
  consequence, or an unrelated baseline.
- Recovery after an operator action does not by itself prove either the action
  or its presumed target was causal.
- A correlation ID links recorded events only within the reliability of its
  propagation, uniqueness, sampling, and timestamp sources.
- The component emitting an error may be reporting an upstream bad input or a
  downstream failure.
- Absence of an event in sampled or expired telemetry is not proof that the
  event did not occur.

Move from correlation to causality by tracing the failure across component
boundaries, finding a mechanism that explains the observations, checking a
nearby working path, and seeking evidence that would differ under competing
causes. Do not manufacture a decisive production test. If the discriminating
test would require mutation, unsafe load, or forced reproduction, record that
limit and classify the result as `PROBABLE` or `UNRESOLVED` as warranted.

## Blameless analysis of human actions

When a human action is material, record what occurred without inferring intent,
competence, memory, or motivation. Reconstruct the information and system state
visible at the time, the constraints and procedures in effect, the interface
or automation behavior, and the safeguards that existed or were absent.

Do not stop at “human error,” “operator mistake,” “the team forgot,” or “user
error.” Determine why the system accepted, propagated, or amplified the action
and what evidence distinguishes the action from the conditions that made it
hazardous. Keep personnel, policy, or disciplinary judgments outside the
technical diagnosis and with the responsible process.

## Mandatory independent diagnosis

Every production incident requires Phase 7, regardless of severity or the main
investigator's confidence.

Give the independent investigator the incident framing, relevant `EP#` and
`OI#` records, black-box/white-box comparison, and sanitized collected
evidence, but withhold the main investigator's favored hypothesis. Require
read-only candidate causal sets, counter-evidence, evidence citations,
blameless analysis of material human actions, and the smallest safe
discriminating tests. The independent investigator cannot mutate production,
edit the repository, own the notebook, propose certainty, or authorize
containment.

Record agreements and disagreements in `DEBUG.md`, including the evidence that
resolves each point and the uncertainty that remains. If no independent
investigator is available, freeze the first hypothesis and run the bundled
contradiction-seeking pass separately. Disclose that the fallback shares
context and is not an independent second opinion; never omit the limitation.

## Blockers and escalation

Stop rather than improvise when:

- access is missing, broader than least privilege, or not demonstrably
  read-only;
- a query's cost, lock behavior, data scope, or side effects are uncertain;
- required evidence has expired, was never collected, is heavily sampled, or
  cannot be used within privacy or security rules;
- the next discriminating test would require a deployment, restart, rollback,
  flag/configuration change, data mutation, forced reproduction, or new
  production instrumentation;
- no authorized owner has assigned severity or can decide operational action;
- evidence suggests credential exposure, compromise, harmful data access, or a
  regulated-data concern;
- neither the independent diagnosis nor the documented contradiction-seeking
  fallback can be completed safely.

For every blocker, record:

1. the exact evidence or diagnostic action that is unavailable;
2. why it is unavailable or unsafe;
3. the minimum safe access, sanitized evidence, or owner decision needed;
4. the appropriate operational, service, security, privacy, or data owner to
   engage, without claiming authority on their behalf;
5. the effect on diagnostic confidence and the next safe read-only action.

Escalation communicates facts, uncertainty, and advisory options. It does not
grant access, change severity, authorize containment, or transfer operational
authority to this skill. If a blocker prevents a responsible leading cause,
finish as `UNRESOLVED`; if evidence strongly favors one cause but the decisive
step is unsafe or unavailable, finish as `PROBABLE` and name that missing
evidence.

## Completion check

Before finalizing an incident diagnosis, verify that:

- production access remained read-only and no operational changes were made by
  the investigation;
- factual state and timeline contain no unmarked causal claims;
- causal confidence follows `CONFIRMED`, `PROBABLE`, or `UNRESOLVED`
  criteria rather than incident pressure;
- sensitive data is minimized and redacted across all evidence forms;
- material evidence is assigned to an `EP#`, and cross-epoch comparisons
  disclose changed conditions;
- material telemetry has an `OI#` integrity disposition, and black-box and
  white-box observations are paired when both are available;
- correlation limits and telemetry gaps are recorded;
- the causal outcome does not force one root cause or use blame as a technical
  explanation;
- the independent diagnosis and reconciliation are present, or the
  non-independent fallback limitation is explicit;
- every containment option is advisory, reversible, separately labeled, and
  includes expected blast-radius reduction, risks, preconditions and authority,
  rollback considerations, post-action read-only observations, and its
  relationship to diagnosis;
- blockers and escalations identify the next safe action without authorizing
  production mutation.
