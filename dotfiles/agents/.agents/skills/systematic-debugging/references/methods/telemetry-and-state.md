# Telemetry Integrity and State Comparability

Read before relying on logs, metrics, traces, alerts, dashboards, or profiles
for a material causal claim. Use checks relevant to that claim, not a blanket
observability audit.

## Validate the evidence channel

Record an `OI#` check with:

- Target identity and whether the failing path is in scope.
- Signal meaning/unit, query, filters, grouping, labels, and cohort.
- Time window, timezone, clocks, ingestion/scrape/alert delay.
- Sampling, buffering, parsing, drops, deduplication, retention, rollups,
  resets, missing series, and known blind spots.
- Collection/query/schema changes between compared observations.
- Independent cross-check when a conclusion depends heavily on one channel.

Disposition: `trusted for claim`, `limited`, or `unusable`. Unknown collection
properties constrain the conclusion; they need not prevent a labeled
preliminary incident update. Cite the check from material dependent evidence.
Reuse it while target/semantics remain unchanged.

### Logs

Use bounded windows and sanitized fields at the source. An empty result may
reflect filters, retention, sampling, buffering, or loss. Absence discriminates
only when the path should emit the event and collection would have retained it.
Successful query execution is not proof that an absent event never happened.

### Metrics

Record definition, units, aggregation, cohort, and interval. Compare numerator
and denominator of rates; changing traffic can change a rate without changing
the mechanism. Account for resets, missing series, rollups, seasonality,
versions, and alert delay. A screenshot without scope/definition is limited.
Internal saturation can be cause, consequence, or baseline, not automatically
user impact.

### Traces and profiles

Verify propagation, uniqueness, sampling, dropped spans, retries, fan-out,
queueing, and cross-host clocks. Existing profiles require workload and
measurement context. Shared IDs or a hot frame do not by themselves prove a
causal chain. Avoid raw attributes, headers, payloads, and stack locals.

## Pair external and internal perspectives

Match black-box caller/user behavior with white-box internal observations by
operation/cohort, artifact, time window, and state. Inspected source describes
a possible mechanism, not runtime evidence by itself.

Healthy aggregates do not disprove a cohort-specific failure. A fast backend
span can coexist with a slow user request because of queueing before the span.
Disagreement between perspectives is evidence to investigate, not discard.

Record the comparison, alignment limits, and what remains unobserved.

## Track material state changes only

Use `EP#` epochs when deployment, configuration, workload, dependency,
operational action, probe, or telemetry conditions change interpretation.
For a stable local failure, a baseline identity is enough; do not manufacture
epoch tables for every command.

For each epoch record effective state, bounded event time, chronological
predecessor, change provenance, evidence, and comparability. IDs follow
discovery order, not necessarily chronology. Preserve earlier interpretations
with explicit revision/supersession links when later evidence corrects them.

Compare across epochs only after explaining why relevant changed conditions
do not invalidate the claim. Multiple simultaneous changes are confounders.
A recovery after operator action is a new observation, not automatic proof
that the action's presumed target caused the incident.

Stateless repetitions do not create epochs. A controlled reversible variation
can stay in a single experiment record capturing both states and restoration.
Git bisection uses commit-scoped `GB#` results within its fixed non-revision
context; do not create an epoch for each commit.
