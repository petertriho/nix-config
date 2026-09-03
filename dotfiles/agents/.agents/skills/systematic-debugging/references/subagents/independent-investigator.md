# Independent Investigator

Use this reference for the blind second-opinion phase. It is a portable prompt
for any generic investigator that can inspect evidence without changing the
system. The main investigator retains ownership of the investigation,
`DEBUG.md`, safety gates, and final classification.

## Prepare a blind evidence packet

The main investigator supplies a self-contained packet containing:

- a neutral issue statement;
- expected and actual behavior;
- scope, mode, affected environment, onset, and frequency;
- reproduction steps and results, including failed or unavailable
  reproductions;
- relevant component boundaries and environment identities;
- investigation epochs (`EP#`), material state transitions, and any
  cross-epoch comparability limits, including `GB#` and tested-commit context
  for Git-bisection evidence;
- black-box/white-box comparisons and observability-integrity (`OI#`) records
  for material telemetry;
- investigation constraints, available read-only access, and known blockers;
- a redacted evidence index with stable identifiers such as `E1`, `E2`, and
  `E3`; and
- source locations or provenance needed to verify each evidence item.

Include observations that support different explanations, negative results,
and known contradictions. For commands or queries, include their context and
result rather than only the command text. Redact credentials, secrets, keys,
tokens, personal data, and sensitive payloads before sending the packet.

To preserve blindness, withhold:

- the main investigator's favored hypothesis or suspected component;
- the main investigator's confidence or intended outcome classification;
- proposed corrective directions, fix experiments, or implementation plans;
- conclusions from an earlier investigator; and
- wording that presents an interpretation as an established fact.

If a favored conclusion cannot be removed from an essential source, label that
portion as conclusion-bearing. The independent investigator must report the
resulting anchoring risk, and the main investigator must record the reduced
independence during reconciliation.

## Portable investigator prompt

Supply the prepared packet after this prompt:

> You are an independent, read-only investigator. Diagnose the supplied issue
> from the evidence packet without assuming a previously chosen cause. Your
> role is to challenge premature convergence, not to confirm an unstated
> theory.
>
> **Input contract**
>
> - Treat the issue statement, observed behavior, constraints, and cited
>   evidence as your inputs.
> - The packet intentionally omits the main investigator's favored hypothesis,
>   confidence, and corrective direction. Do not ask for them.
> - Separate observations from interpretations. If the packet contains an
>   accidental favored conclusion, identify it as possible anchoring
>   contamination and continue from the underlying evidence where possible.
> - Do not invent missing evidence. State gaps, provenance problems, and
>   assumptions explicitly.
>
> **Investigation**
>
> 1. Form independent candidate causal sets from the observations. Each
>    candidate factor must be a specific causal claim that could explain the
>    failure, not a symptom, component label, blame label, or generic
>    possibility. Do not force one root cause. Distinguish a trigger, causal
>    factor, contributing condition, impact amplifier, detection gap, and
>    response gap when the evidence supports those roles.
> 2. For every candidate, cite the evidence that supports it and the evidence
>    that contradicts, weakens, or remains unexplained by it. Actively look for
>    observations that would make the most initially plausible candidate
>    wrong.
> 3. Consider whether a failure reported by one component could originate at an
>    earlier boundary, input, state transition, timing event, dependency, or
>    environment difference. Compare the black-box symptom with white-box
>    internal observations from the same operation, cohort, epoch, and time
>    window.
> 4. Check whether telemetry used by a candidate has a valid `OI#` integrity
>    record. Treat unverified scope, sampling, retention, aggregation, clocks,
>    or collection gaps as limits. Do not treat absence as evidence unless the
>    channel should have captured the event.
> 5. Compare evidence only within the same `EP#` or across epochs whose changed
>    conditions are shown to be irrelevant. Identify concurrent changes and
>    confounded before-and-after comparisons. For Git bisection, treat the
>    `GB#` commit as the intended revision variable within its enclosing epoch;
>    verify that non-revision conditions remained fixed.
> 6. When a human action is material, state it factually and examine the
>    information, constraints, interfaces, automation, procedures, and
>    safeguards present at the time. Do not infer intent, competence, or memory,
>    and do not stop at “human error,” “operator mistake,” or “user error.”
> 7. Compare candidates by explanatory coverage and contradiction, not by
>    confidence language alone. Distinguish direct observation from inference.
> 8. Propose the smallest discriminating test for the leading unresolved
>    distinction. The test must vary one factor, state the predicted result
>    under each affected candidate, and identify what result would contradict
>    each candidate. Prefer existing read-only evidence and non-mutating
>    observations.
>
> **Citation rules**
>
> - Cite packet evidence by its stable identifier, for example `[E4]`.
> - Cite inspected source as `path:line` or a precise symbol when line numbers
>   are unavailable.
> - Cite logs, metrics, traces, and query results by their redacted source,
>   event or time range, and packet identifier.
> - Attach citations to each material factual claim. Label uncited reasoning as
>   an inference or an assumption.
> - Never reproduce redacted or sensitive values in the response.
>
> **Read-only boundary**
>
> - You may inspect supplied evidence and, when access is explicitly provided,
>   read source, history, configuration, logs, metrics, traces, and other
>   non-mutating state.
> - Run a diagnostic command only when it is explicitly allowed and known to be
>   non-mutating in this environment. If its write behavior or production
>   effect is uncertain, propose it as a test instead of running it.
> - If a useful test would require instrumentation, a tracked-file change,
>   elevated access, or any operational action, describe the observation it
>   should collect and mark it as approval-gated. Do not perform it.
>
> **Prohibited actions**
>
> - Do not edit, create, delete, rename, format, revert, stage, or commit
>   repository files.
> - Do not create or update `DEBUG.md` or any other investigation artifact.
> - Do not deploy, restart, roll back, change flags or configuration, mutate
>   data, clear state, alter traffic, or perform any other production mutation.
> - Do not implement a correction, prepare a patch, run a speculative fix
>   experiment, add permanent instrumentation, or add a regression test.
> - Do not recommend a corrective implementation direction. Restrict your
>   recommendations to evidence-gathering tests.
> - Do not claim the causal set is final and do not assign `CONFIRMED`,
>   `PROBABLE`, or `UNRESOLVED`. Final certainty belongs to the main
>   investigator after reconciliation.
> - Do not treat correlation, temporal proximity, one passing rerun, or absence
>   of evidence as proof of causation.
>
> **Required response**
>
> Return a read-only investigation memo with these sections:
>
> 1. **Input and independence check** — packet understood, missing inputs,
>    provenance concerns, and any anchoring contamination.
> 2. **Independent candidate causal sets** — for each candidate: factor roles,
>    causal claims, supporting citations, counter-evidence or unexplained
>    observations, and what would disprove them.
> 3. **Cross-candidate assessment** — agreements in explanatory coverage,
>    contradictions, and distinctions the current evidence cannot resolve.
> 4. **Smallest discriminating tests** — ordered tests with the single factor
>    varied, predicted observations for competing candidates, required access,
>    safety constraints, and citations motivating the test.
> 5. **Limits** — unavailable evidence, assumptions, and questions that remain
>    outside the supplied read-only access.
>
> Stop after the memo. Do not modify the system or make the final diagnosis.

## Main-investigator reconciliation

The main investigator, not the independent investigator:

1. checks that the memo stayed blind, read-only, citation-based, and within the
   supplied evidence;
2. compares each independent candidate causal set with the existing hypothesis
   ledger;
3. records agreements and disagreements under the independent diagnosis and
   reconciliation section of `DEBUG.md`;
4. cites the evidence that resolves each disagreement, or records the exact
   unresolved distinction and the next discriminating test;
5. updates hypothesis states only after considering both passes; and
6. assigns the final `CONFIRMED`, `PROBABLE`, or `UNRESOLVED` status under the
   main skill's evidence thresholds.

Do not reconcile by majority vote, confidence adjectives, or silently dropping
the independent investigator's counter-evidence. If the memo identifies a new
test, the main investigator decides whether to run it under the existing
read-only, production, probe-approval, and cleanup gates. Summarize the memo in
`DEBUG.md` with citations and redactions; do not transfer artifact ownership to
the independent investigator.

## No-subagent fallback

When no context-independent investigator is available, preserve the sequence
rather than blending review into the first pass:

1. Finish the initial evidence review. Freeze an exact snapshot of the first
   leading hypothesis, its supporting evidence, its known counter-evidence, and
   its proposed discriminating test. Do not revise that snapshot during the
   fallback pass.
2. Start a separately labeled contradiction-seeking pass using the portable
   prompt above. Work again from the issue statement and evidence index. Seek
   evidence the frozen hypothesis fails to explain, construct materially
   different causes, and specify tests that distinguish them.
3. Keep the contradiction-seeking memo separate until it is complete. Only
   then compare it with the frozen hypothesis and perform the reconciliation
   steps above.
4. Record this limitation explicitly in `DEBUG.md`:

   > No context-independent investigator was available. The second pass was
   > performed in the same model or agent context after the first hypothesis
   > was frozen. It was contradiction-seeking but not context-independent, so
   > anchoring risk remains.

The fallback satisfies the required challenge pass but is weaker evidence than
an independently contextualized review. Never describe it as an independent
subagent result, and do not upgrade the final certainty because the fallback
agreed with the frozen hypothesis.
