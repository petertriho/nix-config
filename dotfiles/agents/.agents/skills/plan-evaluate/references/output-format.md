# EVALUATION.md Format

When an evaluation target resolves, write exactly one file. If the input
fails and there is no explicit target, return the Nothing Evaluated format in
the final response. Do not create a file. Keep the sections in order. Write
each level exactly as `BLOCKING` or `NOTE`.

## Evaluation Written

```markdown
# Plan Evaluation: <plan-name>

Verdict: READY | NEEDS REVISION
Plan status: Ready | Draft | missing | invalid (<literal value>)
Scope: <PLAN.md path, N claims checked, N steps checked>
Date: YYYY-MM-DD

## Claim Verification

| # | Section | Claim | Result | Evidence |
|---|---------|-------|--------|----------|
| 1 | Assumptions | <claim, shortened> | verified | `path:line` |
| 2 | Implementation Plan, step 3 | <claim, shortened> | refuted | <what the evidence shows> |
| 3 | Validation | <claim, shortened> | unverified | <why> |

## Step Checks

| Step | Boundaries | Concrete | Validation |
|------|------------|----------|------------|
| 1 | respected | yes | `npm test` |
| 2 | implements non-goal "<non-goal>" | hidden decision: <what> | none |

Settled decisions without a step: <none, or one line per decision>
Status: <consistent, or one line per mismatch>

## Findings

### 1. [BLOCKING] category — Action-oriented title (Step 2)

- **Location:** <PLAN.md section, or section and step>
- **Evidence:** <exact evidence; redact secrets>
- **Issue:** <what is wrong>
- **Impact:** <what goes wrong in tasking or execution if unchanged>
- **Suggestion:** <the plan change; do not apply it>

### 2. [NOTE] category — Title (Assumptions)

...

## Omitted Risks

- <what a step affects that the plan does not mention, with `path:line`>

## Evaluation Limits

- <claims not checked and why>
- <areas of the repository not read>
- <anything that could not be verified>
```

Rules:

- Put all `BLOCKING` findings before all `NOTE` findings. Number the findings
  in one sequence across the whole section.
- End every finding title with its anchor in parentheses. The anchor is a
  plan section name, `Step N`, `Validation`, or `Status`.
- Give each finding one root cause. If duplicate symptoms have one
  correction, merge them into one finding.
- If there are no findings, write `No findings.` under `## Findings`. Keep
  every other section.
- If `Omitted Risks` or `Evaluation Limits` has nothing to record, the
  section can say `None.`
- Omit table rows that do not apply. Keep every section header.

## Nothing Evaluated

Use this format when no evaluable plan resolves:

- `PLAN.md` is missing or unreadable.
- There is no plan in `.artifacts/` to select.
- The input is empty or is not a plan.

Nothing Evaluated is not a clean result.

```markdown
# Plan Evaluation: <plan-name or "unknown">

Verdict: NOTHING EVALUATED
Scope: none

## Reason

<missing PLAN.md, unreadable file, or another concrete blocker>

## Next action

<the smallest user decision or repository action needed>
```
