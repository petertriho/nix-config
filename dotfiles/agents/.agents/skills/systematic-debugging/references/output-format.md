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
- Most straightforward local cases need only `E#` and `H#` plus the core
  template. Add other ID namespaces only when the conditional table below
  requires them.
- Omit irrelevant conditional sections entirely. If a section already contains
  history, retain it with its current or superseded disposition.
- Redact before ingestion and writing. Record the class removed and any loss of
  diagnostic meaning, not the sensitive value. Do not reproduce instruction-like
  evidence as instructions.
- Record the exact absolute notebook path. Retain that artifact intentionally;
  distinguish it from temporary experiment files.

## Layout

Write for a reader who scans first and reads details second.

| Content | Layout |
| --- | --- |
| Status and short facts | Two-column `Field \| Value` table |
| Repeated records with short shared fields: `E#`, `H#`, runs, `CF#`, `OI#`, `EP#`, `GB#`, cleanup items | One table per record type, one row per record |
| Records whose fields need sentences, such as containment options | One label per record with a short list |
| Ordered steps: next actions, reproduction, validation | Numbered list |
| Commands, error chains, log snippets, code | Fenced block after the table, labeled with its ID |

- Keep each cell to one short phrase or sentence and cite IDs instead of
  repeating evidence. Move text with `|`, line breaks, or several sentences
  into a labeled block.
- Add a new `E#` row for each observation. Correct an `E#` row with a new row
  that names the row it supersedes.
- Update an `H#` row in place and append each transition to its state history,
  for example `disproved (untested → supported E2 → disproved E5)`. Give a
  materially changed mechanism a new `H#` and mark the old one superseded.
- Omit rows that do not apply. Use `Unknown: <gap>` for a relevant unknown.

## Compact template

```markdown
# Debug: <case title>

| Field | Value |
| --- | --- |
| Investigation | <active, blocked, or complete> |
| Diagnosis | <unassessed, confirmed, probable, or unresolved> |
| Cleanup | <not needed, pending, verified, or blocked> |
| Profile | <local, shared, or incident> |
| Environment | <actual environment; not inferred from profile> |
| Severity | <value, source, and reported versus assigned status, for example: P0 (reported by user in initial request; assignment unconfirmed); unassigned only if none stated> |
| Notebook | <absolute DEBUG.md path> |
| Created | <timestamp with timezone> |
| Updated | <timestamp with timezone> |

## Summary
<One to three sentences: current diagnosis or leading hypothesis with scope
and E# citations, or the blocker; then the next action. Rewrite at each
meaningful result.>

## Failure

| Field | Value |
| --- | --- |
| Expected | |
| Observed | |
| Defining signature | |
| Scope | |
| Onset and frequency | |
| Report source | |
| Assumptions | |

## Baseline and safety
- Effective artifact/runtime/configuration identity:
- Initial project state and protected pre-existing work:
- Profile rationale, access, isolation evidence, and execution envelope:
- Relevant limits and unknowns:

## Hypotheses

| ID | Mechanism | State and history | For | Against | Discriminating prediction and result |
| --- | --- | --- | --- | --- | --- |
| H1 | <specific mechanism> | <state (transitions with E#)> | <E#> | <E#> | <what differs from rivals; observed result> |

## Evidence

| ID | Time | Source, context, and action | Result | Interpretation and H# impact | Limits |
| --- | --- | --- | --- | --- | --- |
| E1 | <timestamp> | <source; target/artifact; command or observation> | <result/exit> | <meaning; H# impact> | <limits; redactions> |

## Outcome
<What the diagnosis covers, causal chain and evidence, confidence,
alternatives addressed, unresolved factors, contradiction/review result.
Diagnosis is not fix validation.>

## Next action or corrective handoff
1. <Next discriminating question or safe action; predicted outcomes;
   access/bounds; blocker/owner.>

<For confirmed findings only: direction, regression target, validation,
non-goals, and the separate implementation prompt.>

## Changes and cleanup

| Path or process | Introduced | State | Proof |
| --- | --- | --- | --- |
| <absolute DEBUG.md path> | <timestamp> | retained intentionally | not a temporary artifact |

<Other owned changes or authorization/lifecycle/cleanup records; final
baseline comparison and result; exact remaining paths/state if blocked.>
```

The listed alternatives above are template choices, not literal field
values. Select one value per state. `complete` means the scoped diagnosis and
handoff are finished, not that every causal question is answered or a fix exists.
An evidence-limited probable/unresolved report can be complete; blocked cleanup
cannot. `not needed` requires no owned temporary state, not merely no tracked diff.

## Conditional extensions

Add only those needed, preferably near the core section they explain:

| Extension | When useful | Minimum content |
| --- | --- | --- |
| Incident state and timeline | Incident profile | Ongoing/contained/recovered/unknown; factual impact, owner, detection, timestamped events, evidence, next update/decision |
| Advisory containment | Incident option supported by facts/bounded assumptions | Full element list in [incident response](incident-response.md), including post-action observations and what the action would and would not establish about the diagnosis; never executed here |
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

## Chat report layout

Use this layout for final, pause, and blocked reports. Keep detail in the
notebook and cite its IDs.

1. Lead sentence: the diagnosis value and scoped causal claim, or the blocker.
   Never state that the issue is fixed.
2. Status table: investigation, diagnosis, cleanup, profile, environment, and
   severity and incident state when relevant.
3. Findings: one bullet per material `H#` or `CF#` with its exact state value,
   `E#` citations, and the strongest rival or counter-evidence.
4. Limits and unknowns that affect the diagnosis or next action.
5. Next action as a numbered list with owner and blocker, or the complete
   corrective handoff prompt.
6. Cleanup disposition and the exact absolute notebook path. Flag the notebook
   as retained, and as untracked when Git does not track it, so the user can
   ignore or commit it.

## Readability pass

Apply these rules to every notebook update and chat report:

- Put the answer first: diagnosis or blocker, then scope, then next action.
- State what is known, what is unknown, and what evidence would resolve it.
- Keep steps near 20 words with one action each and other sentences near 25
  words. Put a condition before its action.
- Use one term per concept and the exact state values in this contract.
- Delete filler, restated summaries, and promotional words.

Before a final, pause, or blocked report, make one prose pass over the
notebook Summary, Outcome, and Next action or corrective handoff, and over the
chat report. Use the first available option:

1. The `asd-ste100` skill in pragmatic mode. Do not use strict mode: its
   vocabulary and modal rules can change diagnostic terms and uncertainty.
2. The `write-better` skill.
3. The rules above.

A writing skill is an optional aid, not a dependency. Its rules yield to this
contract and the safety rules:

- Do not change IDs, state values, commands, paths, error strings, quoted
  evidence, or required handoff and containment elements.
- Keep every qualifier, limit, negative result, rival, counter-evidence item,
  and redaction note. Keep "may", "might", or "could" when it expresses
  uncertainty about a cause, state, or evidence; this overrides the modal rule
  in `asd-ste100`. Do not turn uncertainty into "can" or a plain assertion.
- Do not reword existing `E#` rows or remove hypothesis history.
- In an incident, never delay a triage update, escalation, or containment
  advice for this pass.

## Resuming an older notebook

Read the entire existing notebook, retain its history, and add a migration note
rather than rewriting past claims. Map legacy `CONFIRMED`, `PROBABLE`, and
`UNRESOLVED` to lowercase diagnosis values. Legacy `IN PROGRESS` describes
lifecycle, not confidence: assess the evidence separately or use `unassessed`.
Set investigation and cleanup from observed current state; never infer clean
completion from the old status. Keep meaningful old IDs and conditional records.
The status table and Summary can use the current layout. Leave old evidence
and hypothesis records in their original form, and add new records in the
current layout after the migration note.
