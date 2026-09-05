# Historical, Non-Reproducible, and Production-Only Failures

Preserve original time window, artifact/deployment identity, defining error,
affected population, source provenance, and approved non-secret correlation
aliases. Distinguish reported facts from direct observations.

Reconstruct the path from bounded sanitized logs, metrics, traces, audit
records, and configuration/dependency history. Use
[telemetry and state checks](telemetry-and-state.md) before treating missing
events or cross-window comparisons as meaningful.

Compare affected/unaffected cohorts, requests, hosts, regions, versions, or
windows while controlling known differences. Form hypotheses predicting
different retained evidence. Independent corroboration helps only when sources
do not merely repeat the same underlying signal.

A safe synthetic reproducer must pass the execution gate and preserve relevant
production semantics. Record every fidelity gap: scale, scheduling, topology,
configuration, versions, data shape, and external behavior. New scripts/tests
use [experiment approval](isolated-experiments.md). Never replay real production
identities, payloads, queues, or load through this workflow.

Confirm a scoped finding only when retained traces or a faithful safe
reproducer establish its mechanism and address production-specific rivals.
Correlated signals may support `probable`, not confirmation by repetition.
Expired evidence, missing joins, and sampled absence are limits, not proof of
health or user error. A later healthy window does not erase the original failure.

When decisive evidence is missing, name the exact next collection opportunity,
safe sanitized evidence needed, access/owner, and confidence impact.
Production observation remains read-only even in the `shared` profile.
Use [incident support](../incident-response.md) if operational harm is active
or suspected, without waiting for reproduction or cause.
