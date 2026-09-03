---
name: systematic-debugging
description: "Diagnose local bugs, test/build/CI and integration/configuration failures, flaky or concurrent behavior, performance regressions, and production incidents through evidence-first investigation. Writes a live DEBUG.md with an honest CONFIRMED, PROBABLE, or UNRESOLVED outcome. Diagnosis only: does not implement fixes or mutate production."
disable-model-invocation: true
---

# Systematic Debugging

Diagnose the causal factors of a software failure without implementing the
correction. Work from observed evidence, preserve the user's state, and
maintain a durable `DEBUG.md` throughout the investigation. A later, separately
invoked implementation workflow may act only on a `CONFIRMED` handoff.

## Non-negotiable boundaries

- Diagnose only. Do not implement fixes, refactors, permanent instrumentation,
  regression tests, deployments, restarts, rollbacks, persistent flag or
  configuration changes, shared or user-state changes, or data mutations. The
  required local `DEBUG.md` artifact and approved, isolated Phase 6 diagnostic
  probes are the only investigation-owned state exceptions.
- In an isolated non-production reproducer, vary one ephemeral test input or
  process-local setting at a time only when it cannot affect shared or user
  state. Record the variation and verify restoration or absence of residue.
  Tracked source or test instrumentation still requires Phase 6 approval.
- Revision switching, disposable worktree creation, and Git bisection are
  stateful diagnostic probes. They require Phase 6 approval, isolation from the
  user's active worktree, and recorded cleanup proof.
- Prefer read-only inspection and the smallest safe reproductions. Production
  access is always read-only.
- Do not present a corrective direction unless the outcome is `CONFIRMED`.
  `PROBABLE` and `UNRESOLVED` outcomes name the next discriminating diagnostic
  action instead.
- Incident containment is the only exception to the corrective-direction rule:
  any incident outcome may contain clearly labeled, reversible containment
  advice. It is not a causal correction, authorization, or permission to
  execute.
- Separate facts from interpretations. Redact credentials, secrets, keys,
  tokens, personal data, and sensitive payloads from notes and responses.
- Ask one focused question only when missing expected behavior, access,
  reproduction details, or probe authorization blocks the next safe action.
- Never overwrite, revert, clean up, or otherwise disturb changes that predate
  the investigation.

## Reference loading

Read references progressively, using these conditions:

- Always read [`references/output-format.md`](references/output-format.md)
  before creating or resuming `DEBUG.md`; it is the required notebook contract.
- Read
  [`references/evidence-methods.md`](references/evidence-methods.md) before
  baseline and localization work when choosing or recording discriminating
  tests.
- Read [`references/special-cases.md`](references/special-cases.md) when the
  failure is flaky, timing/concurrency-related, a performance regression,
  environment/external-dependency-specific, non-reproducible, or
  production-only.
- Read
  [`references/incident-response.md`](references/incident-response.md) whenever
  production impact or live production evidence makes this an incident.
- Read the
  [`references/subagents/independent-investigator.md`](references/subagents/independent-investigator.md)
  prompt when Phase 7 is required, whether using an independent investigator or
  the portable contradiction-seeking fallback.

## Canonical records and vocabulary

- Investigation status is exactly one of `IN PROGRESS`, `CONFIRMED`,
  `PROBABLE`, or `UNRESOLVED`.
- Hypothesis state is exactly one of `untested`, `supported`, `contradicted`, or
  `disproved`.
- System-model steps use stable `S#` IDs. Fundamental-premise checks use stable
  `F#` IDs. Investigation epochs use stable `EP#` IDs. Observability-integrity
  checks use stable `OI#` IDs. Final causal findings use stable `CF#` IDs. Git
  bisection sessions use stable `GB#` IDs.
- Final causal roles are exactly `trigger`, `causal factor`,
  `contributing condition`, `impact amplifier`, `detection gap`, or
  `response gap`. Do not force every failure into one root cause.
- Record each meaningful command or query with its context, result or exit
  status, interpretation, and effect on named hypotheses. A command alone is
  not evidence.
- Update `DEBUG.md` after every meaningful observation, hypothesis test,
  epoch transition, observability-integrity check, authorization decision,
  probe change, cleanup action, independent review, or blocker. Do not
  reconstruct the notebook only at the end.

## Nine-rule operating doctrine

This skill adapts the nine-rule method from David J. Agans's *Debugging: The 9
Indispensable Rules for Finding Even the Most Elusive Software and Hardware
Problems*. The rules recur throughout the phases; they are not a shortcut
around the safety boundaries or evidence thresholds.

| Rule | Operational home | Safety adaptation |
| --- | --- | --- |
| 1. **Understand the system** | Phase 3 system model and effective identity checks | Mark unverified links instead of assuming them. |
| 2. **Make it fail** | Phase 3 safe reproduction and failure-signature check | Never force an unsafe or production-only replay. |
| 3. **Quit thinking and look** | Phase 4 direct observation and complete evidence | Observe safely available facts before adding assumptions. |
| 4. **Divide and conquer** | Phase 4 boundary splits, revision bisection, and first-divergence localization | Treat observation gaps as unknown, not ownership proof. |
| 5. **Change one thing at a time** | Phase 5 discriminating tests | Use only the isolated ephemeral variations allowed above. |
| 6. **Keep an audit trail** | Live `DEBUG.md` and stable record IDs | Preserve contradictions, revisions, authorization, and cleanup. |
| 7. **Check the plug** | Phase 3 fundamental-premise checks | Verify effective state without exposing secrets or dumping environments. |
| 8. **Get a fresh view** | Phase 7 independent or contradiction-seeking review | Use it for mandatory triggers and stalled investigations. |
| 9. **If you did not fix it, it is not fixed** | Phases 8-9 diagnosis/fix separation | Only a separate implementation workflow can validate a fix. |

## Google SRE evidence doctrine

This skill also applies five production-diagnosis teachings from Google's SRE
books without weakening the nine-rule method or the safety boundaries.

| Teaching | Operational home |
| --- | --- |
| Model a causal set, not a mandatory single root cause | Phase 8 causal roles and `CF#` findings |
| Pair black-box symptoms with white-box internal observations | Phases 3-4 boundary and perspective comparisons |
| Validate telemetry before relying on it | Phase 3 `OI#` checks and evidence limits |
| Separate evidence after material state changes | `EP#` investigation epochs throughout the notebook |
| Analyze human actions without blame | Phase 8 system, interface, automation, and information context |

## Phase 1: Initialize and protect state

1. Resolve the repository or project root when one exists. Otherwise use an
   authorized local working directory; never store the notebook on a production
   target merely because it is being investigated.
2. Read `references/output-format.md`.
3. If the user explicitly names an existing `DEBUG.md` to continue, resolve its
   exact path, read it, retain its history, and update that file. Do not infer a
   continuation target from a similar case name.
4. Otherwise derive a concise kebab-case case name and create
   `.artifacts/debugging/<case-name>-<YYYYMMDD-HHMMSS>/DEBUG.md` under the
   resolved local root. Check the complete destination first; if it exists,
   append `-2`, `-3`, and so on until unused. Never overwrite another case.
5. Initialize the notebook immediately with status `IN PROGRESS`, even if the
   initial report is incomplete.
6. Record the initial repository state when version control is available:
   reference/commit, worktree status, untracked files relevant to the case, and
   any pre-existing dirty paths. In a non-version-controlled environment,
   record that fact and the best available file/state baseline.
7. Record relevant environment identity—runtime, OS, architecture, versions,
   configuration source, deployment or build identity—without copying secret
   values. Preserve user-provided evidence with the same redaction rule.
8. Start investigation epoch `EP1` from the observed baseline. Add a new epoch
   when a material artifact, configuration, environment, load, dependency,
   operational action, or evidence-collection condition changes how later
   observations must be interpreted. If later evidence reveals an earlier or
   intervening state, append a new stable `EP#`; IDs follow discovery order,
   not necessarily chronology. Record each epoch's chronological predecessor
   explicitly. Git-bisect revisions are nested under `GB#` within one enclosing
   epoch; create a new epoch during bisection only when a non-revision
   condition changes.
9. Treat all pre-existing dirty files as protected. Read-only diagnosis may
   continue, but no diagnostic probe may edit them.

## Phase 2: Frame the failure

1. Record expected behavior and actual behavior separately.
2. Record scope, affected environment, onset, frequency, known recent changes,
   and whether the observation is a fact or an interpretation.
3. Select the notebook mode: development, CI/build, integration, performance,
   flaky/concurrency, or production incident.
4. For an incident, read `references/incident-response.md` and record factual
   impact, affected users or systems, severity, detection source, and a factual
   timeline. Keep impact and chronology separate from causal claims.
5. Ask one focused question only if a missing fact prevents responsible
   framing or the next safe diagnostic step.

## Phase 3: Establish a trustworthy baseline

1. Read `references/evidence-methods.md`. If a special-case entry condition
   applies, also read `references/special-cases.md`.
2. Build a concise system model from source, configuration, manifests,
   architecture evidence, and component contracts. Record the intended path
   from entry point to observed output and identify any unverified gap.
3. Identify the black-box symptom visible to the caller or user and the
   available white-box observations from system internals. Match them by
   operation, cohort, and time window before comparing them.
4. Before a log, metric, trace, alert, dashboard, or profiler result supports a
   material claim, verify its target, definition, query scope, time semantics,
   collection path, sampling or retention limits, and known blind spots. Record
   the result as an `OI#` check.
5. Read complete errors, nested causes, and stack traces rather than diagnosing
   from the last line or a summary.
6. Attempt the smallest safe reproduction. Record the exact context and result.
   If reproduction is intermittent, unsafe, unavailable, or production-only,
   record why and continue with safe observational evidence.
7. Verify that each reproduction has the same defining failure signature as
   the reported issue. A different error or path is a separate observation,
   not proof that the original failure was reproduced.
8. Check relevant fundamental premises and effective state, including the
   actual command target, working context, loaded artifact, input identity,
   configuration precedence, permissions, resource availability, dependency
   reachability, and clock assumptions. Record what was verified instead of
   dismissing these checks as obvious.
9. Compare relevant runtime and dependency versions, configuration shape,
   environment identity, inputs, and recent changes. Git history is useful only
   when Git exists and its history is relevant.
10. For a multi-component path, map the boundaries and verify what enters and
   exits each relevant component before choosing a likely owner.
11. Do not change behavior to manufacture a convenient baseline.

## Phase 4: Localize with evidence

1. Prefer the next safe observation over further theorizing when that
   observation can distinguish the live hypotheses.
2. Trace the first known bad value, state transition, timing event, or control
   decision backward toward its origin.
3. Divide the path at a meaningful midpoint or component boundary. Determine
   which side contains the first divergence, then repeat within that side.
4. Compare the failing path with a nearby working path while controlling
   unrelated differences.
5. When a regression has verified good and bad Git revisions and a repeatable
   predicate, consider `git bisect` under the Phase 6 approval and isolation
   rules. Treat the result as localization evidence, not causal proof.
6. Prefer read-only diagnostics: focused tests, existing logs, metrics, traces,
   profiles, static analysis, and safe queries.
7. Verify component-boundary inputs and outputs instead of assuming a failure
   belongs to the component that reports it.
8. Compare observations only within the same `EP#` or across epochs whose
   changed conditions are shown to be irrelevant. Treat an unexplained
   concurrent change as a confounder, not as evidence for the favored cause.
9. Add every material result to the evidence log with context, result,
   interpretation, hypothesis impact, and redactions. Explicitly record
   evidence that weakens the leading explanation.

## Phase 5: Test one hypothesis at a time

1. Maintain an explicit hypothesis ledger. State each hypothesis as a specific
   causal claim, not a symptom or broad suspicion.
2. For one hypothesis, name its current evidence, expected observation, and the
   smallest test that would distinguish it from plausible alternatives.
3. Change one variable at a time within the allowed isolated diagnostic scope.
   Do not stack speculative corrections or use a test whose result would look
   the same under competing explanations.
4. Set the state to `supported`, `contradicted`, or `disproved` from the
   observed result. Support is not confirmation unless the test establishes
   the causal chain and addresses competing explanations.
5. When a hypothesis fails, preserve the result, derive the next hypothesis
   from the updated evidence, and avoid silently returning to the old claim.

## Phase 6: Use approval-gated probes only when necessary

1. Exhaust reasonable read-only evidence first.
2. Before a stateful Git operation or temporary tracked instrumentation, ask
   one focused question that names the exact revisions or files, isolated
   target, diagnostic operation, reason, risk, and cleanup plan. Proceed only
   after explicit approval.
3. Record the request and every authorization decision separately from any
   probe lifecycle. Preserve `pending`, `approved`, `denied`, and
   `withheld / not approved` decisions even when no probe is introduced; lack
   of approval is a blocker, not evidence that read-only investigation was
   sufficient.
4. For Git bisection, follow the method in `references/evidence-methods.md`.
   Never disturb the active worktree or an existing bisect session. Record the
   enclosing epoch, endpoints, predicate, selected revisions, result, reset,
   and worktree cleanup.
5. Never place a probe in a path that was dirty at Phase 1. Prefer an isolated
   checkout/worktree or an otherwise clean file. If neither is available, stop
   and request a clean target rather than risking existing work.
6. Keep an approved probe minimal and diagnostic. Do not combine it with a fix,
   refactor, permanent logging, or regression test.
7. For an introduced probe, record its authorization reference, exact changed
   paths or repository state, purpose, observations, and intended restoration
   method in its distinct lifecycle record.
8. Remove only changes introduced by this investigation. Compare against the
   initial baseline and record cleanup commands and proof in a cleanup record
   distinct from authorization and probe lifecycle.
9. If cleanup cannot be proved, stop and list the exact affected paths or
   repository state. Retain status `IN PROGRESS` or classify the diagnostic
   outcome without claiming a clean completion, and report the blocker
   prominently.

## Phase 7: Obtain an independent diagnosis when required

This phase is mandatory for:

- production incidents;
- cross-component failures;
- flaky, timing, or concurrency cases;
- performance regressions; and
- any case the main investigator would otherwise classify `PROBABLE`.

For other cases, use this phase when progress stalls, hypotheses repeat without
new evidence, or the current explanation depends on several assumptions.

1. Read
   `references/subagents/independent-investigator.md`.
2. Freeze the current leading hypothesis in the private working context. Give a
   read-only independent investigator the issue statement and collected
   evidence, including relevant `EP#` and `OI#` records and black-box/white-box
   comparisons, but withhold the favored hypothesis and proposed direction.
3. Require independent candidate causal sets, counter-evidence, evidence
   citations, blameless analysis of material human actions, and the smallest
   discriminating tests. The investigator must not edit the repository, mutate
   production, own `DEBUG.md`, implement corrections, or assign final
   certainty.
4. Reconcile agreements and disagreements in the notebook. Record which
   evidence resolves each point and what remains uncertain.
5. If the host has no independent-investigator capability, keep the first
   hypothesis frozen and perform a separate contradiction-seeking pass using
   the bundled prompt. Disclose that this fallback shares context and is not
   truly independent; never imply otherwise.

Localized deterministic failures may skip this phase only when a direct trace
or discriminating test already establishes the causal chain and none of the
mandatory triggers applies. Record why it was not required.

## Phase 8: Classify the outcome

Classify the diagnosis, not the correction state. Even `CONFIRMED` does not
mean the issue is fixed, because this workflow does not implement or activate a
correction.

Choose the strongest status the evidence actually supports:

- `CONFIRMED`: a direct trace or discriminating test establishes one or more
  causal factors and their chain to the observed behavior, and plausible
  competing explanations that could invalidate that chain have been addressed.
  An unresolved additional factor is compatible with `CONFIRMED` only when it
  cannot invalidate any asserted `CF#` or change the corrective direction.
- `PROBABLE`: evidence strongly favors one causal explanation or set, but a
  decisive trace or test is unavailable or unsafe. Name the missing decisive
  evidence.
- `UNRESOLVED`: evidence does not support a responsible leading cause, or the
  next safe test is blocked by missing access, data, reproduction, or
  authorization. Name the exact blocker or uncertainty.

Do not force one root cause. Classify each established final finding as a
`trigger`, `causal factor`, `contributing condition`, `impact amplifier`,
`detection gap`, or `response gap`. A trigger marks onset but is not
automatically a causal factor. For a material human action, record what the
person could observe, the constraints they faced, and which system, interface,
automation, or process condition allowed the outcome. Do not use “human error,”
“operator mistake,” or blame as a terminal technical diagnosis. Do not upgrade
confidence because investigation time is exhausted.

## Phase 9: Finalize the handoff

1. Normalize the live notebook to `references/output-format.md` without
   deleting useful contradictory evidence, uncertainty, authorization, or
   cleanup history. Replace every unused conditional section with
   `Not applicable` and a reason.
2. For `CONFIRMED`, include only the smallest corrective direction justified by
   the confirmed causal set, the public regression-test target, validation
   expectations, non-goals, and a ready-to-use handoff instructing a separately
   invoked implementation workflow to read this exact `DEBUG.md`. Require that
   workflow to verify the correction is present and, when a safe representative
   reproducer exists, rerun it. Otherwise require a predeclared non-production
   or read-only acceptance signal and the reason the original failure cannot be
   replayed. Require the named regression and broader checks before any claim
   that the issue is fixed.
3. For `PROBABLE` or `UNRESOLVED`, do not recommend a patch, fix experiment, or
   implementation direction. Include only the next discriminating
   evidence-gathering action and its access or safety requirements.
4. Incident exception: for any outcome, a separate containment section may list
   reversible advisory options with expected blast-radius reduction, risks,
   preconditions and external authority, rollback considerations, post-action
   read-only observations, and their relationship to diagnosis. Label them as
   containment, not causal corrections. Do not authorize or execute them.
5. Compare final repository/project state with the Phase 1 baseline. Verify that
   no probe edits or temporary files remain and that pre-existing work is
   unchanged. If proof fails, report exact paths and do not claim a clean
   completion.
6. Set the final status, save `DEBUG.md`, and report the outcome plus the exact
   absolute path to the artifact. Never report only a relative path.

## Completion standard

A completed diagnosis preserves an auditable evidence trail, states uncertainty
honestly, proves the investigation did not leave its own edits behind, and
stays within diagnostic authority. Structural plausibility, blame, repeated
guesses, or a passing run after stacked changes are not confirmation. A
confirmed diagnosis is not a completed fix; only the separate implementation
workflow can make and validate that claim.
