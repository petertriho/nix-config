# Flaky, Timing, and Concurrency Evidence

Apply the core execution gate before repetitions, detector runs, or scheduler
changes. Creating instrumentation/helpers requires
[isolated experiment approval](isolated-experiments.md).

## Flaky failures

Define a trial: revision/build, environment, seed/input, isolation/start state,
worker count, dependency identity, timeout, and failure signature.
Predeclare a safe run count or time budget and retain every outcome in order,
including passes. Capture resource pressure and duration from safe existing
observations when relevant.

Establish baseline failures/total trials. Compare pass/failure cohorts under
matched conditions, then stratify or vary one candidate factor at a time.
Report sample size and uncertainty, not simply “rare” or “fixed.”
Zero observed failures is non-observation, not elimination. Avoid assuming
independent trials when warm caches, test order, shared state, or resource
exhaustion couple them.

Seek a direct trace or controlled result linking a mechanism to the failure.
A rate shift alone can support a hypothesis without proving the mechanism.
Retries are behavior to explain, not a diagnosis.

Stop when the run/time/resource budget is exhausted or repetitions risk harm.
Do not repeatedly rerun shared CI/QA jobs without establishing their effects.
Name the next passive observation or isolated reproduction opportunity.

## Timing and concurrency

Build an event timeline with operation identity, task/thread/process, state
transitions, lock/queue events, cancellation/deadlines, and component boundaries.
Use monotonic times within an appropriate clock domain; across hosts prefer
causal relationships over wall-clock proximity.

Find the first violated invariant and happens-before relation. For deadlock,
seek a wait-for chain rather than naming the last observed waiter as owner.
Compare successful and failing timelines under matched concurrency and load.

Use existing race/deadlock detectors and traces after inspecting execution
effects. An approved isolated experiment may vary worker count or controlled
synchronization. Wait on observable events with bounded timeouts rather than
arbitrary sleeps.

Adding a sleep, serializing execution, or raising a timeout may hide a symptom.
Treat changed behavior as scheduling-sensitive evidence, not proof of cause.
Check load, resource pressure, clock skew, cancellation behavior, and observer
effects as rivals. Added logging may perturb the race.

If required observation changes timing, exceeds privacy bounds, or requires
production mutation, preserve the limit and seek a safe isolated workload or
existing passive trace. Never force a production race or corruption.

Escalate high-impact corruption/deadlock concerns and use independent review
when impact, material ambiguity, or stalled progress warrants it; ordinary
flakiness alone does not mandate a second agent.
