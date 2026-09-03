# Discriminating Evidence Methods

Use these methods to choose observations that separate plausible causes rather
than merely making one explanation sound reasonable. They apply to local,
build, integration, and other diagnostic settings. Keep all activity within the
main skill's read-only and approval boundaries.

The SRE-specific methods adapt Google's
[Effective Troubleshooting](https://sre.google/sre-book/effective-troubleshooting/),
[Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/),
[Postmortem Culture](https://sre.google/sre-book/postmortem-culture/), and
[Canarying Releases](https://sre.google/workbook/canarying-releases/).

## Contents

- [What makes evidence discriminating](#what-makes-evidence-discriminating)
- [Build a working system model](#build-a-working-system-model)
- [Verify fundamental premises](#verify-fundamental-premises)
- [Change one variable at a time](#change-one-variable-at-a-time)
- [Read complete errors and stack traces](#read-complete-errors-and-stack-traces)
- [Build a minimal safe reproduction](#build-a-minimal-safe-reproduction)
- [Trace values, state, timing, and control flow backward](#trace-values-state-timing-and-control-flow-backward)
- [Divide the path and localize the first divergence](#divide-the-path-and-localize-the-first-divergence)
- [Compare a working path with a broken path](#compare-a-working-path-with-a-broken-path)
- [Inspect recent changes conditionally](#inspect-recent-changes-conditionally)
- [Use Git bisect for regression localization](#use-git-bisect-for-regression-localization)
- [Verify component-boundary inputs and outputs](#verify-component-boundary-inputs-and-outputs)
- [Pair black-box and white-box observations](#pair-black-box-and-white-box-observations)
- [Validate telemetry as an evidence channel](#validate-telemetry-as-an-evidence-channel)
- [Separate evidence into investigation epochs](#separate-evidence-into-investigation-epochs)
- [Compare environment, configuration, versions, and dependencies](#compare-environment-configuration-versions-and-dependencies)
- [Build a causal set without blame](#build-a-causal-set-without-blame)
- [Record evidence, not just activity](#record-evidence-not-just-activity)
- [Redact without destroying diagnostic meaning](#redact-without-destroying-diagnostic-meaning)
- [Method selection check](#method-selection-check)

## What makes evidence discriminating

A test is discriminating when plausible candidate causes predict meaningfully
different observations from it. Define those predictions before running the
test.

For each proposed test:

1. Name the causal claim being tested and at least one realistic alternative.
2. State the observation expected if the claim is true.
3. State the different observation expected under the alternative.
4. Hold unrelated inputs and conditions constant.
5. Choose the smallest safe observation that exposes the difference.
6. Record the actual result even when it is surprising, empty, or inconclusive.

A result that would look the same under every candidate cause is not
discriminating. For example, rerunning a failing command without controlling or
observing any suspected factor may establish frequency, but it does not by
itself identify a cause. Likewise, a successful run after changing a
dependency, configuration, input, and cache state together cannot attribute the
change in behavior to any one of them.

Evidence may support a hypothesis without confirming it. Confirmation requires
a direct causal trace or a discriminating result that also addresses plausible
competing explanations.

Tag each result with the applicable investigation epoch. Before relying on a
telemetry result, cite an observability-integrity check that establishes what
the channel can and cannot show. A precise-looking result from the wrong epoch
or an unverified collection path is not strong evidence.

## Build a working system model

### Method

Before selecting a cause, describe the smallest model that explains how the
affected behavior should work:

- entry point and observable output;
- relevant components and owners;
- data, state, timing, and control-flow transitions;
- contracts at component boundaries;
- effective artifact, runtime, dependency, and configuration identity; and
- external resources or environmental preconditions on the path.

Derive the model from inspected source, manifests, configuration provenance,
architecture records, runtime metadata, and observed behavior. Mark every
unverified edge or assumption. Do not mistake a diagram, declared version, or
configuration file for proof of the effective runtime path.

### How it discriminates

A working model exposes where a proposed cause could enter the path, what it
could influence, and which observations should exist if it were true. It also
rules out explanations that occur after the first bad state or outside the
affected path.

### Evidence produced

Record the intended path, provenance for each material link, component
contracts, effective identities, and unresolved gaps. Update the model when
evidence contradicts it instead of forcing observations into the original
diagram.

## Verify fundamental premises

### Method

Check the simple conditions that must be true for the investigation itself to
be valid. Select only premises relevant to the case:

- the command, test, process, endpoint, device, or host is the intended target;
- the working directory, arguments, input, and environment are the intended
  ones;
- the running binary, image, package, build, or source revision is the expected
  artifact;
- the effective configuration comes from the expected source and precedence;
- required files, storage, memory, CPU, permissions, credentials presence,
  network path, and dependency endpoint are available;
- clocks, time zones, locale, architecture, and protocol versions match the
  assumptions used in the diagnosis; and
- the observation tool itself is attached to the correct scope and is not
  hiding, sampling, caching, or redirecting the evidence.

Verify effective state through the narrowest safe observation. Do not expose
secret values, dump the full environment, or turn this into an indiscriminate
checklist. Record a failed premise as evidence, not as an embarrassing mistake
to omit.

### How it discriminates

These checks separate failures in the assumed setup from failures in the
complex mechanism built on top of it. They also prevent an investigation from
explaining one artifact, environment, or request while observing another.

### Evidence produced

Record each checked premise, its expected state, observed state, provenance,
and effect on the hypotheses. For unchecked premises, record why they are
irrelevant or what blocks safe verification.

## Change one variable at a time

Use matched observations: preserve the same input, artifact, environment, and
execution path except for the single factor under test. If a factor cannot be
isolated, record the confounder and lower the strength of the conclusion.

Before an allowed isolated diagnostic variation:

- capture the current result and relevant state;
- identify the one factor to vary;
- predict the result for the leading and competing hypotheses; and
- define how the original state will be preserved or restored.

Prefer selecting among already existing working and failing cases over
modifying a system. Limit variation to one ephemeral test input or process-local
setting in an authorized isolated non-production reproducer. It must not affect
shared or user state. Record the variation and verify restoration or absence of
residue. Any temporary source or test instrumentation still requires the
approval and cleanup process in the main skill.

Do not:

- combine speculative corrections into a diagnostic experiment;
- call a test successful merely because the failure disappeared;
- infer which of several simultaneous differences mattered;
- keep altering variables until a preferred result appears; or
- discard runs that contradict the leading explanation.

## Read complete errors and stack traces

### Method

Collect the complete diagnostic chain available for the same failure: primary
message, nested causes, stack frames, error codes, timestamps, and nearby
context. Preserve frame order and distinguish where an error was created from
where it was reported or wrapped. Expand truncated output when a safe,
read-only mechanism exists.

Read from both ends:

- from the outer message inward to understand reporting and recovery layers;
- from the earliest relevant inner cause outward to follow propagation; and
- around the first application-owned frame or component boundary, without
  assuming that ownership implies causality.

### How it discriminates

The full chain can separate an originating failure from a later wrapper,
cleanup failure, or generic exit message. Frame order and nested causes can
distinguish bad caller input from a callee defect, and an application failure
from an environment or dependency failure.

### Evidence produced

Record the complete redacted error identity, the earliest relevant cause, the
reporting layer, significant frames or boundaries, and any missing or truncated
portion. Note which candidate causes are incompatible with the observed order.

Example: an outer “operation failed” message is compatible with many causes. A
nested parse error that precedes network cleanup narrows the causal path toward
the supplied document and away from cleanup as the initiating cause.

## Build a minimal safe reproduction

### Method

Start from the observed failure and remove irrelevant scope while preserving
the suspected mechanism. Reduce one dimension at a time, such as input size,
number of components, concurrency, or optional configuration. After each
reduction, verify whether the defining failure signature remains the same.

Record why the reproduction is safe and representative. If reproducing would
mutate important state, expose sensitive data, overload a service, or require
unauthorized access, do not attempt it; record that limitation and use
observational evidence instead.

### How it discriminates

Each successful reduction rules out removed elements as necessary causes. A
reduction that changes the error identity or execution path marks a boundary
where the original mechanism may have been lost. Comparing the smallest
failing case with the nearest passing case often isolates one necessary input
or precondition.

### Evidence produced

Record the original and reduced contexts, each single reduction, whether the
same failure signature persisted, and the smallest known failing and passing
cases. Do not record only the final compact command.

Example: if a processor fails with a ten-field document, remove one optional
field per run while keeping the runtime and configuration constant. If failure
persists until one field is removed, that field is a discriminating input; it
is not yet proof of whether the field, its producer, or its consumer is faulty.

## Trace values, state, timing, and control flow backward

### Method

Begin at the first reliable bad observation, then move backward through existing
evidence until reaching the last known-good point and the first divergence.
Choose the trace dimension that matches the failure:

- **Value:** follow where a value was read, transformed, serialized, or
  validated.
- **State:** follow transitions, ownership, persistence, and the preconditions
  of the invalid state.
- **Timing:** reconstruct event order using comparable clocks or causal
  relationships; do not treat timestamp proximity alone as ordering proof.
- **Control flow:** identify the branch, callback, dispatch, or error path that
  selected the observed behavior and the condition that selected it.

Prefer existing source, logs, traces, metrics, and safe queries. If the chain
has a gap, name it instead of filling it with an assumption.

### How it discriminates

The first divergence separates downstream components that merely receive bad
state from the producer or condition that introduced it. Backward tracing also
tests whether the proposed cause occurs before, and can actually influence, the
observed effect.

### Evidence produced

Record an ordered provenance chain, the last known-good observation, the first
known-bad observation, transformations or transitions between them, clock or
ordering limitations, and every unresolved gap.

Example: if a renderer receives an empty label, trace the label through
deserialization, transport, and source construction. A non-empty value before
serialization but an empty value after deserialization discriminates the
serialization boundary from later rendering logic.

## Divide the path and localize the first divergence

### Method

Choose a meaningful midpoint in the system model, such as a function boundary,
process handoff, serialized message, queue, network call, persisted record, or
state transition. Observe the value, state, timing, and control decision at
that point in both a failing and nearby working path.

Determine whether the first known divergence is before or after the midpoint.
Continue within the implicated half until further division would be less
reliable than a direct trace or discriminating test. Use component contracts
and actual boundaries; do not split by arbitrary file count or call-stack
depth.

When only one side is observable, state the remaining interval and the missing
boundary evidence. Do not convert an observation gap into ownership or cause.

### How it discriminates

Each split excludes a bounded part of the path from containing the first
observed divergence. Repeated splits reduce a broad symptom to the smallest
evidence-supported interval without requiring a speculative fix.

### Evidence produced

Record each boundary, its expected and actual input or output, the working
comparison, which side retains the divergence, and any observation gap. The
result localizes the cause; it confirms the cause only when the causal mechanism
is then traced or tested.

## Compare a working path with a broken path

### Method

Choose the nearest trustworthy working case, not an unrelated example. Build a
matched comparison across input, code or artifact identity, configuration,
runtime, dependencies, environment, execution path, and timing. List all known
differences before deciding which one matters.

Test one difference at a time when a safe isolated comparison is possible. If
several differences cannot be separated, keep the comparison as localization
evidence rather than causal proof.

### How it discriminates

Shared properties become less likely to explain the difference in behavior;
properties unique to the failing path become candidates. A single controlled
difference that consistently tracks the outcome can rule between hypotheses
that assign causality to different factors.

### Evidence produced

Record a working-versus-broken matrix, the source and trustworthiness of each
value, controlled differences, uncontrolled differences, and whether the
behavior followed the isolated factor.

Example: two jobs use the same input and build artifact, but resolve one
effective configuration value differently. A comparison that holds the
artifact and input constant localizes the investigation toward configuration
resolution; it does not justify changing that value until its causal role is
tested.

## Inspect recent changes conditionally

### Method

Treat “recent” broadly: source, build inputs, resolved dependencies,
configuration, data shape, runtime image, deployment identity, permissions, and
external service behavior can all change. Start with the onset window and
compare a known-working identity with a failing identity.

When a trustworthy version-control system is available, use its read-only
history and diff facilities. In a Git repository, conditional examples include:

```text
git log -- <relevant-path>
git diff <known-working>...<failing> -- <relevant-path>
```

Select revisions from recorded evidence; do not guess a “good” revision. Git is
not required. In non-Git settings, compare release manifests, build metadata,
package-resolution records, configuration snapshots, deployment inventories,
or other available provenance. File modification times can guide inspection,
but are weak provenance on their own.

### How it discriminates

A change outside the causal path weakens change-based explanations. A change
whose introduction aligns with the onset and affects the first divergent value,
state, timing, or branch becomes a stronger candidate. Temporal alignment alone
does not establish causality; the changed factor still needs a trace or
discriminating comparison.

### Evidence produced

Record the working and failing identities, the provenance source, relevant
differences, onset alignment, and the mechanism by which each difference could
produce the symptom. Explicitly record inspected changes that do not intersect
the failing path.

## Use Git bisect for regression localization

Use `git bisect` when ordinary history inspection leaves a range of candidate
commits and testing selected revisions can safely identify where the behavior
changed. Bisection localizes an introducing commit. It does not by itself prove
which changed line or mechanism caused the failure.

### Preconditions

Use revision bisection only when all these conditions hold:

- the repository uses Git, and its history is relevant to the failing artifact;
- evidence identifies one known-good revision and one known-bad revision;
- the known-bad revision produces the defining failure signature;
- one repeatable predicate can classify historical revisions as good, bad, or
  untestable;
- the searched history is sufficiently monotonic for that predicate; and
- historical revisions can be built or tested without unsafe external effects.

Do not guess the good endpoint. Verify both endpoints with the same predicate
before starting. Stabilize a flaky predicate first. If environmental drift,
expired dependencies, schema changes, or unavailable fixtures make historical
results incomparable, use `skip` and record the limitation. Stop when too many
adjacent revisions are untestable to identify a responsible boundary.

### Protect repository state

Treat bisection as a stateful diagnostic probe because it switches revisions
and writes Git administrative state. Obtain explicit approval under Phase 6 of
the main skill before starting. The request must name the known-good and
known-bad revisions, predicate, isolated target, risks, and cleanup plan.

Record the initial reference, immutable commit, worktree status, registered
worktrees, and any active bisect operation. Never replace or continue a bisect
session that this investigation did not create. Do not stash, reset, clean, or
checkout over pre-existing user changes.

Prefer a dedicated disposable worktree at the known-bad revision. Keep the
user's active worktree unchanged. If an approved clean isolated worktree is not
available, stop and request one instead of running bisection in a dirty or
shared worktree.

Assign the session an enclosing `EP#` that fixes every non-revision condition.
Each tested result must cite that `EP#`, the `GB#`, and the tested commit. The
commit identity in `GB#` supplies the intentionally varying artifact. If the
environment, inputs, build procedure, load, or observability conditions change,
start a new epoch and record which revision comparisons remain valid.

### Run the bisection

Hold the environment, inputs, build procedure, and failure-signature check
constant so that revision identity is the only intended variable. In the
approved isolated worktree, start with the verified endpoints:

```text
git bisect start <known-bad> <known-good> --
```

For a manual bisection, run the predeclared predicate at each selected revision.
Mark only the observed result:

```text
git bisect good
git bisect bad
git bisect skip
```

Use `git bisect run <predicate-command>` only when the predicate is deterministic
and safely automated. Its exit status must mean:

- `0`: the target behavior is good;
- `1` through `127`, except `125`: the defining bad behavior occurred;
- `125`: this revision cannot be tested and must be skipped; and
- any other status: stop the automated bisection.

Prefer an existing predicate command. If a wrapper is necessary, keep it
outside the bisected worktree so revision changes cannot replace it. Include
the wrapper in the authorization and cleanup records.

Do not let an unrelated build, setup, timeout, or infrastructure failure return
a bad status. The predicate must verify the defining failure signature. Map an
untestable revision to `125`; abort when the test procedure itself is
untrustworthy.

Before reset, preserve the tested revision sequence:

```text
git bisect log
```

Then inspect the reported first-bad commit and its relevant diff. Trace the
changed behavior into the causal path and address competing explanations. A
commit can contain several changes, expose an older defect, or only alter the
conditions that trigger one.

### Restore and verify

After collecting the evidence, run `git bisect reset` in the isolated worktree.
Verify that the worktree returned to its recorded starting revision and that no
bisect operation remains active. Remove only a disposable worktree created by
this investigation, after preserving its evidence, and verify that the user's
original worktree and registered worktrees are unchanged.

If reset or cleanup cannot be proved, report the exact repository and worktree
state as a cleanup blocker. Do not claim a clean completion.

### Evidence produced

Record:

- authorization and the isolated worktree identity;
- the enclosing `EP#` and fixed non-revision conditions;
- verified good and bad endpoints with evidence IDs;
- the exact predicate, failure-signature check, and exit-status mapping;
- each tested or skipped revision, preferably through `git bisect log`, with
  each result linked to its `E#`;
- the first-bad commit or unresolved commit range;
- the relevant diff and how it intersects the causal path;
- reasons for skips, ambiguity, or non-monotonic results; and
- `git bisect reset`, worktree cleanup, and final-state proof.

## Verify component-boundary inputs and outputs

### Method

For each relevant boundary, write down:

- the producer and consumer;
- the expected contract;
- the observed redacted input;
- the observed redacted output or error;
- the identity or correlation evidence tying both sides to the same operation;
  and
- any transformation, queueing, retry, or serialization between observations.

Verify both sides when possible. Do not assume the component that emits the
visible error created the bad condition.

### How it discriminates

Bad input already present at a boundary shifts attention upstream. Correct
input followed by incorrect output localizes the first divergence to the
component or unobserved transformation inside that boundary. Disagreement
between producer and consumer records can identify transport, serialization,
routing, or observation mismatches.

### Evidence produced

Record a boundary map and a per-boundary input/output result, including contract
versions, operation identity, first divergence, and observation gaps.

Example: if a worker rejects a task, compare the producer's emitted task
identity and schema with what the worker received. A valid producer record and
a malformed consumer record distinguishes transport or decoding candidates
from task construction, provided both records refer to the same task.

## Pair black-box and white-box observations

### Method

Use both perspectives when they exist:

- **Black-box observation:** behavior visible at an external contract, such as
  a caller result, user-visible output, test assertion, protocol response, or
  end-to-end latency.
- **White-box observation:** internal runtime state exposed by existing logs,
  metrics, traces, profiles, queues, effective configuration, or component
  diagnostics.

Inspected source can explain an expected mechanism, but it is not by itself a
runtime white-box observation. Verify that the inspected source belongs to the
effective artifact before using it to interpret internal evidence.

Identify the black-box symptom first so the investigation remains tied to the
reported failure. Then match white-box observations to the same operation,
cohort, artifact, and time window. At a component boundary, compare what the
caller observed with what the callee observed. Verify correlation identity,
sampling, retries, fan-out, queueing, and clock limits before treating the two
records as one causal path.

Do not substitute internal abnormality for user-visible failure. A saturated
resource, warning, retry, or slow dependency can be a cause, consequence,
masked failure, or unrelated baseline. Conversely, a healthy aggregate
dashboard does not disprove a black-box failure confined to one cohort, tail,
version, or path.

### How it discriminates

Agreement between external failure and an internal first divergence can
localize the mechanism. Disagreement can expose a network or queue delay,
incorrect aggregation, retry masking, routing mismatch, stale configuration,
or a gap in the observation system.

### Evidence produced

Record the external contract and result, internal observation, operation or
cohort identity, matched epoch and time window, known alignment limits, and
the discrepancy or causal link. If one perspective is unavailable, state the
resulting gap instead of inventing the missing view.

Example: a frontend reports a ten-second backend timeout while the backend
records a forty-millisecond operation after nine seconds in a queue. The paired
views localize the dominant delay before execution; the backend's fast service
time alone does not show a healthy end-to-end path.

## Validate telemetry as an evidence channel

### Method

Treat the observation path as part of the system. Before a log, metric, trace,
alert, dashboard, or profile supports a material claim, verify the relevant
properties:

- target identity and whether the failing path emits the signal;
- signal definition, unit, event semantics, and expected failure behavior;
- exact query, filters, labels, grouping, cohort, and aggregation;
- time range, timezone, clock relationship, collection delay, and alert delay;
- sampling, buffering, retries, deduplication, dropped records, and cardinality
  controls;
- retention, rollups, resets, missing series, and expired evidence;
- deployment, instrumentation, schema, or query-definition changes between
  compared windows; and
- an independent cross-check when the conclusion depends heavily on one
  channel.

Select only checks relevant to the claim. Do not turn this into a broad
environment or sensitive-data dump. Record each check as an `OI#` entry with a
disposition of `trusted for claim`, `limited`, or `unusable`.

Absence is discriminating only when the signal was expected to exist, the
failing path was in collection scope, retention covers the event, and the
collection path was capable of preserving it. A successful query proves that
the query ran; it does not prove that an absent event never occurred.

### How it discriminates

An integrity check separates system behavior from monitoring behavior. It can
show that two charts use different populations, that a trace omitted the
failing requests, that a log pipeline dropped the relevant interval, or that a
dashboard's aggregation hid a cohort-specific failure.

### Evidence produced

Record the signal and claim, target and scope, query semantics, time semantics,
collection limitations, independent cross-check, disposition, and supporting
evidence. Cite the `OI#` record from every material conclusion that depends on
that telemetry source.

## Separate evidence into investigation epochs

### Method

Use stable `EP#` records to divide observations whose interpretation depends on
different effective state. Start `EP1` from the initial baseline. Start a new
epoch when a material change affects the behavior under investigation or the
ability to observe it, including:

- artifact, deployment, configuration, feature, dependency, or data-shape
  identity;
- restart, failover, scaling, routing, cache, queue, or traffic state;
- workload, cohort, host class, resource pressure, or external-service state;
- containment or another operator action observed during an incident;
- approved diagnostic instrumentation or another stateful probe; or
- telemetry definition, sampling, collection, retention, or query behavior.

Epoch IDs follow discovery order, not necessarily event chronology. If later
evidence reveals an earlier or intervening state, append a new `EP#` with its
actual bounded time. Record the chronological predecessor explicitly; it is the
state immediately before this epoch in event time, not the previous numeric
ID. If later evidence changes that predecessor or transition, append a
superseding epoch record. Do not renumber or silently rewrite existing records.

Record changes performed by external operators as observations without
claiming authority or causality. Do not create a new epoch for a stateless
repeat under unchanged conditions. A controlled test can stay in one test
record when it captures both states, changes one variable, and proves
restoration. Use a new epoch when the changed state persists or can affect
later evidence.

Record operational provenance through the automation or service, change role or
authority, and a sanitized audit reference when available. Do not require a
person's name. Use a neutral alias only when cross-event correlation is
diagnostically necessary and authorized.

Git bisection is a nested revision-scoped context. Assign the session one
enclosing `EP#` whose environment, inputs, build procedure, load, and
observability conditions remain fixed. Each bisection-derived `E#` cites that
epoch plus the `GB#` and tested commit; the effective artifact identity comes
from the ordered `GB#` revision record. Do not create one epoch for every
selected commit. Start a new epoch only when a non-revision condition changes,
and record the resulting comparability limit in `GB#`.

Compare evidence across epochs only after listing the changed conditions and
showing they are irrelevant to the claim. If several material changes occur
together, preserve the confounding rather than assigning the outcome to the
most conspicuous change.

### How it discriminates

Epochs prevent an observation after a deployment, mitigation, restart, or
telemetry change from being treated as though it came from the original
failure state. They expose concurrent changes that weaken before-and-after
attribution and identify stable windows suitable for matched comparison.

### Evidence produced

Record start and end times, effective artifact/configuration/environment/load,
the chronological predecessor, material transition from that predecessor, its
source or authority, evidence references, and which other epochs remain
comparable for specific claims.

## Compare environment, configuration, versions, and dependencies

### Method

Create a compact matrix for the nearest working and failing contexts. Include
only factors plausibly connected to the path:

- operating system, architecture, runtime, and execution mode;
- application or artifact identity;
- effective configuration values and their source;
- dependency versions and resolution source;
- feature or capability availability;
- permissions and external endpoint identity; and
- locale, time zone, resource limits, or other relevant process conditions.

Compare effective state, not merely checked-in or declared state. Inspect only
named relevant settings rather than dumping an entire environment. Use
manifests or resolver output where available; do not assume the requested
dependency version is the loaded version.

If an authorized isolated non-production reproducer exists, vary one permitted
ephemeral input or process-local factor while holding the artifact and other
inputs constant. Otherwise record the comparison as observational evidence
with its confounders.

### How it discriminates

The matrix separates code-path hypotheses from conditions unique to one
environment. Effective-state checks can distinguish configuration-source
errors from application interpretation, and resolved-version checks can
distinguish dependency drift from identical-code failures.

### Evidence produced

Record the two context identities, relevant effective values or versions,
their provenance, controlled and uncontrolled differences, and the result of
any single-factor comparison.

Example: if the same artifact and input pass under one runtime version and fail
under another in otherwise matched isolated contexts, runtime compatibility is
supported. It remains unconfirmed until the differing behavior is traced to a
relevant runtime semantic or a competing environmental difference is ruled
out.

## Build a causal set without blame

### Method

Do not force a failure into one mandatory root cause. At final classification,
assign each established finding one precise role:

- **Trigger:** the event or transition that started this occurrence;
- **Causal factor:** a defect or condition whose correction would prevent the
  failure from recurring in the same way;
- **Contributing condition:** a condition that increased likelihood without
  independently explaining the failure;
- **Impact amplifier:** a condition that increased severity, scope, or
  duration;
- **Detection gap:** a system or process condition that delayed or prevented
  discovery; or
- **Response gap:** a system or process condition that delayed or complicated
  containment or recovery.

A trigger is not automatically a causal factor. A deployment can expose a
pre-existing defect; a restart can clear symptoms without identifying the
mechanism; and a monitoring alert can reveal an incident without causing it.
Link every `CF#` finding to the causal chain and evidence that justifies its
role.

Before `CONFIRMED`, address every plausible alternative that could invalidate a
causal factor or chain link. An unresolved additional factor can coexist with a
confirmed causal set only when evidence shows that it cannot invalidate the
set or change the corrective direction. Otherwise retain `PROBABLE`.

When a human action appears in the chain, record the action factually and ask:

- What information and system state were visible at the time?
- What constraints, defaults, interface cues, procedures, or automation shaped
  the action?
- Which safeguard was expected, and did it exist or operate?
- Why could the system accept, propagate, or amplify the action?
- What evidence distinguishes the action from the conditions that made it
  hazardous?

Do not speculate about intent, competence, memory, or mental state. “Human
error,” “operator mistake,” “the team forgot,” and “user error” are labels for
an event, not terminal technical explanations. Describe intentional or
policy-related facts only when evidence supports them, and leave personnel or
disciplinary judgments to the responsible process.

### How it discriminates

A causal set distinguishes onset from mechanism, likelihood from impact, and
detection from response. Blameless human-action analysis identifies whether
the failure depends on ambiguous interfaces, unsafe defaults, missing
validation, weak automation, incomplete information, or inadequate isolation
instead of ending at the person nearest the event.

### Evidence produced

For each `CF#`, record its role, specific condition, mechanism, causal-chain
position, evidence, recurrence or impact significance, and remaining
uncertainty. For a material human action, also record the contemporaneous
information and constraints, relevant system or process conditions, expected
safeguard, and unsupported assumptions that were excluded.

## Record evidence, not just activity

Add a record to `DEBUG.md` after every meaningful observation or test. Use the
output contract's evidence fields, with at least:

| Field | Required content |
| --- | --- |
| Context | Where and under what artifact, environment, input, permissions, and assumptions the observation was made |
| Command or query | Exact read-only command, query, tool action, or manual procedure; write `Not applicable` for a supplied observation |
| Exit/result | Exit status when available plus the relevant redacted output, measured value, or observed state |
| Interpretation | What the result establishes, what it does not establish, and known confounders |
| Epoch | The `EP#` state in which the observation was made |
| Observability integrity | Applicable `OI#`, or why the evidence is not telemetry-derived |
| Hypothesis impact | Named hypothesis, direction of impact, and resulting canonical state |
| Redactions | Sensitive classes removed or summarized, without preserving their values |

An exit status is part of the result, not its interpretation. Exit zero may
mean only that a diagnostic command ran successfully. Empty output, a timeout,
missing access, and an unavailable tool are also results and must be recorded
when they affect the investigation.

Use the canonical hypothesis states from the main skill:

- `untested`: no relevant test has been completed;
- `supported`: evidence is consistent with the claim and increases its
  plausibility, but does not rule out all material alternatives;
- `contradicted`: evidence conflicts with the claim, but the test or trace is
  not decisive enough to rule it out; and
- `disproved`: a valid discriminating test or causal trace rules out the claim
  under the investigated conditions.

Never delete a contradicted or disproved hypothesis. Preserve its original
claim, prediction, test, result, state transition, and reason. If later evidence
requires reconsideration, add a new state transition and explain what was wrong
with the earlier test or assumptions; do not silently relabel it.

If a test does not distinguish the named candidates, record “no discriminating
impact” and leave their states unchanged. A hypothesis must not become
`supported` solely because a broad command passed, a failure did not recur
once, or several variables changed together.

## Redact without destroying diagnostic meaning

Do not copy credentials, secrets, keys, tokens, personal data, or sensitive
payloads into commands, notes, examples, or the final artifact. Prefer:

- stable placeholders such as `<redacted:token>` or `<redacted:user-id>`;
- non-sensitive structure, type, length, count, status, or schema information;
- narrowly quoted error text with sensitive fields removed; and
- aggregate or bounded summaries instead of raw payloads.

Record what class of data was redacted and whether redaction limits the
interpretation. Do not retain a low-entropy secret by hashing or partially
masking it. Keep correlation labels local to the investigation and
non-reversible. If useful evidence cannot be captured safely, record the
limitation and choose a safer test.

## Method selection check

Before accepting a conclusion, verify:

- the intended system path and effective runtime identity were understood;
- relevant fundamental premises were checked rather than assumed;
- the complete error chain was considered;
- the reproduction is representative or its limitation is explicit;
- the reproduced failure matches the original defining signature;
- the causal path is traced to the first observed divergence;
- the path was divided at useful boundaries when the initial scope was broad;
- a nearby working comparison was used when available;
- recent changes were inspected through available provenance, with Git used
  only when applicable;
- Git bisect was used only with verified endpoints, a representative predicate,
  explicit approval, an isolated clean worktree, and recorded cleanup, or its
  inapplicability was clear;
- relevant component inputs and outputs were verified;
- black-box and white-box observations were paired when both were available;
- telemetry carrying a material claim has a valid `OI#` integrity disposition;
- evidence comparisons use compatible `EP#` epochs or disclose every material
  changed condition;
- effective environment, configuration, versions, and dependencies were
  compared;
- the final outcome uses a supported causal set without forcing one root cause
  or treating blame as a technical explanation;
- each material result has context, result, interpretation, and hypothesis
  impact; and
- no conclusion depends on stacked changes, unsupported assumptions, or a test
  that competing causes would also pass.
