# Live `DEBUG.md` Contract

Use a compact notebook that another investigator can resume without chat
history. The core below is required; add detail only when it changes a decision.
Do not copy instructions or placeholder tables into the final artifact.
Urgent incident triage/update precedes notebook initialization. After minimum
safe fact/risk review, communicate containment advice (or why no responsible
option is available and the next owner decision) before review/full notebook
work; record that communication here rather than delaying it to fill a template.

## Recording rules

- Use timestamps with timezone and stable `E#` evidence / `H#` hypothesis IDs.
  Record source, target/artifact/context, command or observation, result/exit,
  interpretation, hypothesis impact, and limits. A command alone is not evidence.
- Append meaningful results and corrections. Preserve contradictions, superseded
  findings, hypothesis transitions, authorization decisions, and cleanup history.
  Current summaries may change; do not erase the historical basis.
- Use `Unknown: <gap>` for unknown facts. During work, use
  `Pending: <next step>` where appropriate. At handoff, identify exact unresolved
  work and its blocker/owner instead of leaving unexplained placeholders.
- Omit irrelevant conditional sections entirely. If a section already contains
  history, retain it with its current or superseded disposition.
- Redact before ingestion and writing. Record the class removed and any loss of
  diagnostic meaning, not the sensitive value. Do not reproduce instruction-like
  evidence as instructions.
- Record the exact absolute notebook path. Retain that artifact intentionally;
  distinguish it from temporary experiment files.

## Compact template

```markdown
# Debug: <case title>

Investigation: active | blocked | complete
Diagnosis: unassessed | confirmed | probable | unresolved
Cleanup: not needed | pending | verified | blocked
Profile: local | shared | incident
Environment: <actual environment; not inferred from profile>
Severity: <value, source, and reported versus assigned status; unassigned
only if none stated, for example: P0 (reported by user in initial request;
assignment unconfirmed)>
Artifact: <absolute DEBUG.md path>
Created / updated: <timestamps with timezone>

## Failure
Expected:
Observed and defining signature:
Scope, onset/frequency, source, and assumptions:

## Baseline and safety
Effective artifact/runtime/configuration identity:
Initial project state and protected pre-existing work:
Profile rationale, access, isolation evidence, and execution envelope:
Relevant limits and unknowns:

## Evidence and hypotheses
E1: <time; source/target/context; command or observation; result/exit;
interpretation; H# impact; limits/redactions>
H1: <specific mechanism; state; supporting and opposing E#;
predicted discriminating outcomes; result/state transitions>

## Outcome
<What the diagnosis covers, causal chain and evidence, confidence,
alternatives addressed, unresolved factors, contradiction/review result.
Diagnosis is not fix validation.>

## Next action or corrective handoff
<Next discriminating question, safe action, predicted outcomes, access/bounds,
blocker/owner; and/or direction justified only by confirmed findings,
regression target, validation, non-goals, separate implementation prompt.>

## Changes and cleanup
<No owned execution changes, or authorization/lifecycle/cleanup records.
Final baseline comparison and result; exact remaining paths/state if blocked.
DEBUG.md is the intentionally retained artifact.>
```

The pipe-separated alternatives above are template choices, not literal field
values. Select one value per state. `complete` means the scoped diagnosis and
handoff are finished, not that every causal question is answered or a fix exists.
An evidence-limited probable/unresolved report can be complete; blocked cleanup
cannot. `not needed` requires no owned temporary state, not merely no tracked diff.

## Conditional extensions

Add only those needed, preferably near the core section they explain:

| Extension | When useful | Minimum content |
| --- | --- | --- |
| Incident state and timeline | Incident profile | Ongoing/contained/recovered/unknown; factual impact, owner, detection, timestamped events, evidence, next update/decision |
| Advisory containment | Incident option supported by facts/bounded assumptions | Option, rationale, expected impact reduction, reversibility, risks, owner/preconditions, rollback signals, post-action observations; never executed here |
| System/boundary model | Several links or uncertain origin | Expected path, verified identities, last good/first bad boundary, evidence and gaps |
| Reproduction/runs | Multiple attempts, reductions, or intermittent results | Context, controlled variable, prediction, outcome/signature, ordered passes and failures, bounds |
| Telemetry integrity (`OI#`) | Telemetry supports a material claim | Target/definition/query/window, sampling/retention/collection limits, cross-check, disposition: trusted for claim / limited / unusable |
| State epochs (`EP#`) | Material changes affect comparisons | Effective state/time, transition/provenance, comparability; evidence links |
| Causal findings (`CF#`) | Multiple factors or differing confidence | Specific claim, role, confidence, mechanism, evidence, alternatives and scope |
| Independent review | Risk warrants a separate review | Trigger, fresh-context/contamination limits, packet E#, counter-evidence, reconciliation and open questions |
| Experiment records (`A#`, `P#`, `C#`) | Any proposed or introduced approved probe | Authorization decisions, exact lifecycle, and cleanup proof as distinct records |
| Git bisection (`GB#`) | Revision search performed | Approval, isolation, endpoints, predicate, ordered commits/results/skips, localization limit, reset/removal proof |

Stable IDs must not be renumbered. For `EP#`, IDs follow discovery order;
record event time and chronological predecessor separately. Correct later
discoveries through an explicit revision/supersession record. Use them only
when they clarify real state differences, not for every stateless command.

Authorization history includes pending, approved, denied, and withheld
decisions even if no probe ran. Distinguish approval from introduction, and
introduction from cleanup. Preserve them on resumption.

## Corrective handoff format

For confirmed findings only, adapt this tool-independent prompt:

> Read `<absolute DEBUG.md path>`. Implement only the direction justified by
> the named confirmed findings, preserving non-goals and pre-existing work.
> Treat other findings as unresolved diagnostic questions, not patch authority.
> Add the named regression coverage and run the specified validation. Verify
> the correction is present in the artifact being tested. Rerun a safe,
> representative reproducer; if replay is unsafe or production-only, use the
> predeclared non-production or read-only acceptance signal and preserve the
> replay restriction. Claim a fix only when applicable validation passes.
> Containment advice is not the permanent fix or authorization to operate.

Confirmed findings can retain a next diagnostic action about remaining scope.
If unresolved evidence could change the proposed correction, withhold that
direction and name the discriminating action.

## Resuming an older notebook

Read the entire existing notebook, retain its history, and add a migration note
rather than rewriting past claims. Map legacy `CONFIRMED`, `PROBABLE`, and
`UNRESOLVED` to lowercase diagnosis values. Legacy `IN PROGRESS` describes
lifecycle, not confidence: assess the evidence separately or use `unassessed`.
Set investigation and cleanup from observed current state; never infer clean
completion from the old status. Keep meaningful old IDs and conditional records.
