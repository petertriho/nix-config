# Performance Regression Diagnosis

## Define the comparison

State the quantity/objective: latency percentile, throughput, startup,
capacity, memory/CPU/I/O, or cost. Specify workload, data volume, warm-up,
duration, sample count, hardware/host class, software/configuration identity,
cache state, dependency health, and measurement tool.

Compare known-good and suspected-bad contexts under equivalent conditions.
If equivalence is impossible, list material differences instead of attributing
the delta to code. Apply the execution gate to benchmarks/builds/profilers;
no synthetic production load or active production profiler attachment.

## Measure noise and user-visible effects

Predeclare safe run/time/resource bounds. Retain repeated samples and their
distribution, not only the average or worst value. Interleave good/bad runs
when safe to reduce time-based bias. Verify the harness can measure the effect
without saturating the generator or sampling it away.

Report percentiles, variance, failures, and throughput together where relevant.
Account for warm-up, cache effects, host noise, workload drift, and dependency
conditions. One unmatched sample is insufficient evidence of a regression.

## Localize changed cost

Use existing traces/profiles/query plans and allocation, CPU, I/O, queue, or
lock observations with [telemetry integrity](telemetry-and-state.md).
Relate internal cost to the actual request/job and matched time window.
Separate execution from waiting and caller-visible time from server service time.

A hot frame or high CPU may be a consequence or baseline. Seek a reproducible
delta beyond measured noise plus evidence tying the changed cost to the claimed
mechanism and explaining the end-to-end effect.

Test one factor in an approved isolated experiment where needed. Check target
and tradeoff metrics: improvement in latency is not success if errors,
throughput, memory, or another percentile deteriorate.

If representative load or a stable baseline is unavailable, report what effect
is detectable, uncertainty, and the next safe measurement. Use risk-based review
for high impact, ambiguity, or stalled investigation, not every benchmark.
