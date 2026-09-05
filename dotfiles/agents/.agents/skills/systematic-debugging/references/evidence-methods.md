# Evidence Method Index

Read the method that answers the next diagnostic question, not this entire
reference tree. All execution remains subject to the core safety gate.

| Need | Read |
| --- | --- |
| Understand the path, check premises, reduce a reproduction, trace a divergence, compare boundaries | [Localization](methods/localization.md) |
| Compare versions/configuration, inspect history, safely bisect | [Environment and revision comparison](methods/environment-and-revisions.md) |
| Interpret logs/metrics/traces, validate absence, compare changing system states | [Telemetry and state](methods/telemetry-and-state.md) |
| Write a disposable reproducer/test, instrument, or test one candidate patch | [Isolated experiments](methods/isolated-experiments.md) |
| Investigate intermittent results, races, deadlocks, or timeouts | [Flaky and concurrency](methods/flaky-and-concurrency.md) |
| Measure and localize a latency/throughput/resource regression | [Performance](methods/performance.md) |
| Reconstruct historical or production-only failures without replay | [Retained evidence](methods/retained-evidence.md) |

## Common reasoning standard

Name a specific mechanism and a realistic rival. Predict observations that
would differ under those explanations before running a test. A repetition may
measure frequency without discriminating cause; record that honestly.

Select observations by information gained relative to risk, time, and cost.
Prefer a controlled comparison or direct trace over speculative changes.
Control unrelated variables or name the confounders. A changed result alone,
temporal proximity, or a component reporting an error does not prove origin.

Do not force one root cause. Distinguish onset triggers from causal factors,
likelihood conditions, impact amplifiers, detection gaps, and response gaps
when the distinction matters. For material human actions, examine observable
information, constraints, interfaces, automation, and safeguards. Do not
speculate about intent or end the diagnosis at “human error.”

## Method lineage

The methods adapt David J. Agans's nine debugging rules: understand the system,
make it fail safely, observe rather than guess, divide and conquer, vary one
thing, keep an audit trail, check fundamentals, get a fresh view, and verify
fixes in the separate implementation workflow.

SRE grounding:
[Effective Troubleshooting](https://sre.google/sre-book/effective-troubleshooting/),
[Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/),
[Postmortem Culture](https://sre.google/sre-book/postmortem-culture/), and
[Canarying Releases](https://sre.google/workbook/canarying-releases/).
The local/shared/incident profiles are this skill's design, not official SRE
profile names.
