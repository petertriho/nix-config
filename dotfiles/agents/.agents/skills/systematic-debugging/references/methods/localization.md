# Localize the First Divergence

## Model the path and check the fundamentals

Describe the smallest relevant path: entry point, expected output, components,
contracts, data/state/timing transitions, and external resources. Derive it from
inspected source, manifests, effective runtime metadata, and observations.
Mark unverified links rather than treating an architecture diagram as proof.

Check only premises that affect this case:

- Actual command target, working directory, arguments, input, and execution mode.
- Loaded artifact/revision, runtime/dependency versions, and configuration
  precedence, rather than merely checked-in declarations.
- Permissions class, credential presence/source without values, storage,
  memory/CPU limits, dependency reachability, clocks, locale, and architecture.
- Observation tool scope, caching, filtering, and collection behavior.

A failed premise is evidence, not an embarrassing fact to omit. Record its
expected/observed state, source, and effect on hypotheses.

## Read the relevant complete error chain

Use source-side redaction and bounded snippets to obtain the primary message,
nested causes, error codes, significant frames, timestamps, and context.
Expand truncation safely in bounded follow-ups; do not dump a whole log.
Preserve frame order and distinguish error creation, wrapping, reporting,
recovery, and cleanup failures.

Read inward to the earliest relevant cause and outward through propagation.
The first application frame helps locate a boundary but does not prove blame.
Record missing portions and redaction limits. An outer “operation failed”
message may conceal a parse error that occurred before network cleanup.

## Reduce a safe reproduction

Apply the execution gate first. Remove one dimension of irrelevant scope at a
time: input size, optional fields, components, concurrency, or configuration.
Preserve the defining signature and relevant execution path after each change.
Record original/reduced context, controlled differences, result, and limits.

If reduction loses the signature, it may have removed a necessary condition or
changed mechanisms. Do not count a new exception as reproducing the old bug.
Compare the smallest failing case with its nearest passing case.

Removing a field and eliminating a failure identifies a discriminating input,
not yet whether its producer, consumer, or contract is defective. A new
reproducer script/test or modified source requires
[experiment approval](isolated-experiments.md).

## Trace backward

Start from the first reliable bad observation and seek the last known-good
point. Choose the relevant dimension:

- **Value:** reads, transformations, serialization, validation.
- **State:** transitions, ownership, persistence, invariant preconditions.
- **Timing:** causal order, waits, deadlines, cancellation.
- **Control:** branch, callback, dispatch, and the selecting condition.

Record the provenance chain and gaps. A plausible source path must match the
effective artifact and observed execution, not merely look capable of failing.

## Divide at meaningful boundaries

Choose a function/process handoff, network call, queue, serialized message, or
persisted state near the middle of the implicated path. Compare working and
failing observations on both sides; repeat within the interval containing the
first divergence. Do not split by arbitrary file count.

At each boundary capture producer/consumer, expected contract, sanitized input
and output, and evidence that both observations refer to the same operation.
Account for transformations, retries, fan-out, and asynchronous handoffs.
When one side is unobservable, report the interval and evidence gap rather
than assigning ownership.

Example: a non-empty label before serialization and an empty one after
deserialization localize a boundary, provided they refer to the same operation.
Further evidence must distinguish encoder, transport, schema, and decoder.

## Compare nearby working and failing paths

Choose the closest trustworthy working case. List differences in input,
artifact, configuration, runtime, dependencies, load, and timing before picking
one as causal. Control one factor when safely possible; otherwise state
confounders. Properties shared by both paths can still interact with a differing
condition, so do not automatically rule them out.

Record the matched comparison, observed first divergence, alternatives
addressed, and next discriminating observation.
