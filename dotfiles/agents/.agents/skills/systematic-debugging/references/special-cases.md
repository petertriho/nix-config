# Special-Case Routing

These are diagnostic techniques, not additional operating profiles. A flaky
bug can be local, shared, or incident. Apply multiple methods when needed;
load only the relevant files/sections.

| Entry condition | Method | Watch for |
| --- | --- | --- |
| Equivalent runs alternate pass/fail | [Flaky failures](methods/flaky-and-concurrency.md#flaky-failures) | All outcomes, baseline rate, seed/state, sample uncertainty |
| Ordering, contention, deadlock, cancellation, or timeout matters | [Timing and concurrency](methods/flaky-and-concurrency.md#timing-and-concurrency) | Happens-before, invariants, observer effects |
| Latency, throughput, capacity, startup, memory, or cost worsens | [Performance](methods/performance.md) | Comparable workload, noise, distributions, tradeoff metrics |
| Machine, CI runner, region, account, dependency, or configuration differs | [Environment comparison](methods/environment-and-revisions.md#compare-effective-environments) | Effective rather than declared identity; shared effects |
| Historical, unavailable, unsafe, or production-only reproduction | [Retained evidence](methods/retained-evidence.md) | Fidelity gaps, sampled/expired evidence, no forced replay |

If telemetry is material, also read
[telemetry and state](methods/telemetry-and-state.md). If a method needs a new
script, instrumentation, synchronization helper, or candidate patch, use
[approved isolated experiments](methods/isolated-experiments.md).

Apply the core risk-based review rule; a special-case label alone does not
require a second agent. Stop repetitions when the safety/run budget is reached.
Name the next evidence opportunity rather than increasing confidence to
compensate for missing data.
