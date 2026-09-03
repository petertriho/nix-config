# Special Diagnostic Cases

Use this reference only after the failure has been framed and a safe baseline is
being established. Apply every branch whose entry condition matches. These
branches refine evidence collection; they do not relax the main skill's
read-only preference, probe approval gate, redaction rules, outcome thresholds,
or diagnosis-only boundary.

## Contents

- [Rules shared by all branches](#rules-shared-by-all-branches)
- [Flaky failures](#flaky-failures)
- [Timing and concurrency defects](#timing-and-concurrency-defects)
- [Performance regressions](#performance-regressions)
- [Environment and external dependency failures](#environment-and-external-dependency-failures)
- [Non-reproducible or production-only cases](#non-reproducible-or-production-only-cases)

## Rules shared by all branches

- Record observations in `DEBUG.md` with environment, input, time window,
  command or query context, result, interpretation, hypothesis impact, and the
  applicable `EP#` investigation epoch.
- Start a new `EP#` when a material artifact, environment, load, dependency,
  operational action, probe, or telemetry condition changes the interpretation
  of later observations. Git-bisect revision changes remain nested under `GB#`
  in one enclosing epoch; start a new epoch only if a non-revision condition
  changes. Do not compare incompatible epochs as one experiment.
- Before telemetry supports a material claim, record an `OI#` check for its
  target, definition, scope, time semantics, collection limits, and blind
  spots. Pair black-box and white-box views when both are available.
- Hold unrelated variables constant. If they cannot be controlled, name them
  as limitations rather than treating the comparison as decisive.
- Prefer an observed event, state transition, trace, or bounded condition check
  over a fixed delay. A sleep may alter scheduling or hide a symptom; it does
  not establish timing causality.
- Separate association from cause. A correlated change, timestamp, metric, or
  dependency event is a lead until a direct trace or discriminating test links
  it to the failure.
- Do not force one root cause or end at a blame label. If a human action is
  material, examine the contemporaneous information, constraints, interface,
  automation, process, and safeguards that shaped or amplified it.
- Do not force reproduction by increasing production load, corrupting data,
  weakening safeguards, exposing sensitive payloads, or making an unapproved
  repository or environment change.
- If the next decisive test is unsafe, unavailable, or unauthorized, document
  the limitation and the smallest next safe test. Classify the case
  `PROBABLE` or `UNRESOLVED` as required; do not compensate with stronger
  wording.

## Flaky failures

**Enter when:** Nominally equivalent runs alternate between pass and fail, or
the failure rate varies without an intentional input change.

### Safe evidence

- Define the trial precisely: revision/build, environment, seed, input,
  isolation level, start state, timeout, and observed result.
- Run a bounded series only when repetitions are safe. Record every outcome,
  including passes, in order; do not retain only failures.
- Capture per-run seeds, resource pressure, worker count, dependency identity,
  durations, and relevant event timestamps using existing observability.
- Compare failure and success cohorts under the same declared conditions.
  Stratify by one candidate factor at a time, such as worker count, seed,
  runtime version, host class, or dependency endpoint.

### Repeated-run strategy

1. Choose a predeclared run count or time budget that cannot create harmful
   load.
2. Establish the observed baseline rate with numerator and denominator, not
   labels such as "rare" or "often."
3. Test one causal factor while preserving the baseline conditions elsewhere.
4. Compare rates and failure signatures, and report sample size and uncertainty.
   Zero failures in a small series is evidence of non-observation, not proof of
   elimination.

**Independent diagnosis and escalation:** A second opinion is mandatory for
every flaky case. Provide the investigator the full ordered run record without
the leading hypothesis. Escalate when failures cluster by a cross-component
boundary, production impact appears, or the safe run budget cannot distinguish
the candidates.

**Causality threshold:** Assign a cause only when a direct trace or a
repeatable, one-variable discriminating test changes the failure behavior as
predicted and plausible rival explanations are addressed. A rate shift supports
a hypothesis but does not by itself prove the mechanism.

### Invalid conclusions

- "It passed once, so it is fixed" or "it failed once, so this factor caused
  it."
- Treating retries as a diagnostic explanation.
- Selecting only failing logs or only a favorable run window.
- Attributing the failure to the most common correlated host, seed, or timing
  value without controlling alternatives.

**Safe limitation:** If repetitions are expensive, destructive, or capable of
amplifying an incident, stop repeating. Preserve the available cohort, state
the observation limit, and request passive evidence or an isolated safe
reproducer.

## Timing and concurrency defects

**Enter when:** Outcome depends on ordering, overlap, latency, timeout,
parallelism, cancellation, clock behavior, or shared-state access.

### Safe evidence

- Build an event timeline from monotonic timestamps where available. Include
  operation identity, thread/task/process, state transition, lock or queue
  event, cancellation, deadline, and component boundary.
- Trace happens-before relationships and identify the first invariant
  violation, not merely the final timeout or exception.
- Compare successful and failing timelines at the same concurrency and load.
  Then vary one safe scheduling factor, such as worker count or controlled
  synchronization, in an isolated environment.
- Use existing race/deadlock detectors, scheduler traces, lock/queue metrics,
  and correlation identifiers when available. Temporary instrumentation still
  requires the main skill's approval and cleanup procedure.

**Asynchronous test strategy:** Wait for an observable condition or event with
a bounded timeout and record when it occurred. Do not use an arbitrary sleep as
proof that a race exists or is absent. If a delay changes behavior, treat that
as scheduling-sensitive evidence and trace the intervening events before
assigning a cause.

**Independent diagnosis and escalation:** A second opinion is mandatory for
every timing or concurrency case. Escalate immediately for cross-process or
cross-service ordering, suspected deadlock or data corruption, production-only
contention, or traces that cannot establish a reliable clock/order relation.

**Causality threshold:** Require a trace that exposes the invalid ordering or
shared-state transition, or a controlled synchronization test that removes or
induces the failure exactly as the hypothesis predicts. Address alternative
explanations such as load, timeout configuration, resource exhaustion, clock
skew, and observer effects.

### Invalid conclusions

- "Adding a sleep makes it pass, therefore the previous line is the cause."
- Inferring global order from wall-clock timestamps across unsynchronized
  systems.
- Calling a last-observed waiter the deadlock owner without a wait-for chain.
- Treating a timeout increase or serial execution as proof of a causal factor.
- Assuming added logging is neutral when it may change scheduling.

**Safe limitation:** If observation perturbs timing or the required trace would
expose sensitive data or add production risk, record the observer limitation.
Prefer existing low-overhead telemetry or an isolated workload; otherwise name
the missing ordering evidence.

## Performance regressions

**Enter when:** Latency, throughput, resource use, startup time, capacity, or
cost worsened relative to an explicit baseline or objective.

### Safe evidence

- Define the measured quantity, percentile or aggregate, workload, warm-up,
  duration, sample count, hardware/host class, software build, configuration,
  cache state, dependency conditions, and measurement tool.
- Compare a known-good and suspected-bad version under equivalent conditions.
  If equivalence is impossible, list every material difference.
- Collect repeated measurements after a declared warm-up and retain the
  distribution, not only an average or worst sample. Report variance,
  percentiles, errors, and throughput together where relevant.
- Use existing profiles, traces, query plans, allocation/CPU/I/O metrics, and
  component latency breakdowns. Correlate resource changes with the request or
  job path using stable identifiers and matched time windows.

### Measurement strategy

1. Confirm the measurement system and workload can detect the claimed
   regression without saturating or sampling away the effect.
2. Establish repeated good and bad samples, preferably interleaved when safe
   to reduce time-based environmental bias.
3. Localize the changed cost to a component, operation, wait state, or resource.
4. Test one candidate factor and check both the target metric and relevant
   tradeoff metrics.

**Independent diagnosis and escalation:** A second opinion is mandatory for
every performance regression. Escalate for production impact, cross-component
latency, shared infrastructure noise, unexplained benchmark instability, or
when profiling would require unsafe load or mutation.

**Causality threshold:** Require a reproducible delta beyond measured noise plus
a trace/profile or controlled test that attributes the changed cost to the
claimed mechanism. A temporal match with a deployment or a hotter profile frame
is not sufficient unless it explains the end-to-end regression and competing
environmental factors are addressed.

### Invalid conclusions

- Claiming a regression from one sample, unmatched before/after runs, or
  averages that hide distribution changes.
- Comparing different workloads, cache states, host classes, data volumes, or
  dependency health without qualification.
- Treating high CPU, memory, I/O, or a profile hotspot as the cause merely
  because it is conspicuous.
- Declaring success when one metric improves by shifting cost to errors,
  throughput, another percentile, or another component.

**Safe limitation:** Do not generate risky traffic or run invasive profilers in
production. If representative load or a stable baseline is unavailable, record
the detectable effect, environmental uncertainty, and the next safe
measurement rather than assigning a performance cause.

## Environment and external dependency failures

**Enter when:** Behavior differs by machine, container, CI runner, region,
account, runtime/configuration, network path, or external service state.

### Safe evidence

- Inventory relevant identities and shapes without secret values: OS and
  architecture, runtime and dependency versions, feature/configuration source,
  permissions class, locale/time zone, resource limits, DNS/network route,
  certificate validity metadata, endpoint identity, and deployment/build.
- Compare working and failing environments field by field. Prefer normalized
  manifests or hashes for sensitive configuration, recording presence, source,
  and effective precedence rather than contents.
- Verify inputs and outputs at each component or dependency boundary: request
  metadata, status/error class, latency, retry behavior, schema/protocol
  version, and correlation identifier.
- Use passive dependency health, audit, status, metrics, and existing traces.
  Repeat safe queries only within rate limits and a predeclared bound.

**Comparison strategy:** First establish whether the same artifact and input
diverge across environments. Then isolate one difference at a time in an
authorized non-production setting. For intermittent dependencies, compare
matched success/failure windows and distinguish local client behavior from the
remote response.

**Independent diagnosis and escalation:** A second opinion is mandatory when
the case crosses component/service boundaries, becomes a production incident,
or would otherwise be classified `PROBABLE`. Escalate to the responsible owner
when safe evidence requires privileged logs, provider telemetry, contractual
limits, or data that must not be copied.

**Causality threshold:** Require evidence that the specific environment or
dependency condition reaches the failing path and that a controlled comparison,
boundary trace, or provider-confirmed event distinguishes it from client code,
input, configuration precedence, and network alternatives. External timing
correlation alone is not attribution.

### Invalid conclusions

- "Works locally" as proof that the application is correct.
- Blaming the network, CI, cloud, DNS, permissions, or a vendor from a generic
  timeout or contemporaneous status event.
- Treating configuration file contents as effective configuration without
  checking precedence and runtime identity.
- Assuming retries prove a remote fault rather than masking a local race,
  overload, or timeout mismatch.

**Safe limitation:** Do not expose credentials, payloads, or personal data to
compare environments, and do not bypass access controls or rate limits. Record
missing owner evidence and the exact redacted query or correlation identifiers
needed for the next safe handoff.

## Non-reproducible or production-only cases

**Enter when:** The reported failure cannot be reproduced safely in an
authorized test environment, historical evidence is all that remains, or the
behavior has only been observed in production.

### Safe evidence

- Preserve the original time window, deployment/build identity, request/job or
  correlation identifiers, affected population, error signature, and source of
  each fact.
- Reconstruct the path from existing read-only logs, metrics, traces, audit
  records, and configuration/dependency history. Use the narrowest safe queries
  and summarize or redact sensitive output.
- Compare affected and unaffected requests, users, hosts, regions, versions, or
  windows while controlling known differences. Check whether the observation
  is absent because telemetry is missing rather than because behavior was
  healthy.
- Re-run only a non-destructive equivalent in an isolated environment. Record
  every fidelity gap between that model and production; a synthetic pass does
  not erase the production observation.

**Evidence strategy:** Form hypotheses that make distinct predictions about
retained evidence. Seek independent corroboration across telemetry sources and
component boundaries. If retention has expired or identifiers do not join,
record the broken evidence chain rather than filling it with assumptions.

**Independent diagnosis and escalation:** A second opinion is mandatory for
every production incident and every cross-component case. It is also mandatory
before a `PROBABLE` classification. Escalate when production access, telemetry,
data-owner review, or authorization is missing; do not infer the unavailable
result. All live production inspection remains read-only.

**Causality threshold:** Confirm only when retained traces establish the causal
chain or a faithful, safe reproducer discriminates the cause and addresses
production-specific alternatives. Multiple correlated signals may strongly
support `PROBABLE`, but they do not become `CONFIRMED` through repetition or
consensus alone.

### Invalid conclusions

- "Cannot reproduce" as proof that the issue is gone, false, or user error.
- Replaying real production payloads, identities, or load without explicit
  authorization and safety controls.
- Triggering failures in production, weakening safeguards, or mutating state to
  obtain cleaner evidence.
- Treating absence of logs as absence of failure, or a later healthy window as
  evidence of the earlier cause.
- Recommending a corrective implementation from a `PROBABLE` or `UNRESOLVED`
  reconstruction.

**Safe limitation:** When reproduction or decisive live evidence is unsafe,
unavailable, expired, or unauthorized, state the exact gap and next safe
collection opportunity. Preserve the honest `PROBABLE` or `UNRESOLVED`
classification. For incidents, any containment discussion remains separate,
advisory, reversible, and unexecuted under the main skill's rules.
