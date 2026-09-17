# EVALUATION.md Format

Write exactly one file when an evaluation target is resolved. On an input
failure with no explicit target, return the Nothing Evaluated format in the
final response without creating a file. Keep the order of sections. Use
`BLOCKING` or `NOTE` exactly.

## Evaluation Written

```markdown
# Plan Evaluation: <plan-name>

Verdict: READY | NEEDS REVISION
Plan status: Ready | Draft
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

- Order findings `BLOCKING` then `NOTE`. Number them across the whole section.
- Every finding title ends with its anchor in parentheses: a plan section
  name, `Step N`, `Validation`, or `Status`.
- One root cause per finding. Merge duplicate symptoms with one correction.
- When there are no findings, write `No findings.` under `## Findings` and keep
  every other section.
- `Omitted Risks` and `Evaluation Limits` may say `None.` when there is
  nothing to record.
- Omit table rows that do not apply, but keep every section header.

## Nothing Evaluated

Use this when the plan cannot be read (missing or unreadable `PLAN.md`, or no
`.artifacts/` plan to select). It is not a clean result.

```markdown
# Plan Evaluation: <plan-name or "unknown">

Verdict: NOTHING EVALUATED
Scope: none

## Reason

<missing PLAN.md, unreadable file, or another concrete blocker>

## Next action

<the smallest user decision or repository action needed>
```
