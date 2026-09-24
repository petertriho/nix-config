# REVIEW.md Format

If the review target is known, write exactly one file to it. If it is not
known, do not create a file. Give the Nothing Reviewed report in the final
response. `SKILL.md` defines the review target.

Keep the sections in the order below. Write each severity exactly as
`CRITICAL`, `HIGH`, `MEDIUM`, or `INFO`.

## Review Written

```markdown
# Implementation Review: <plan-name>

Verdict: APPROVED | NEEDS CHANGES
Base ref: <ref or "working tree">
Scope: <N files changed, resolver mode, PLAN.md and TASKS.md paths>
Date: YYYY-MM-DD

## Task Conformance

| Task | Checkbox | Acceptance | Result | Evidence |
|------|----------|------------|--------|----------|
| T1 | [x] | <acceptance line, shortened> | met | `path:line` or command |
| T1 | [x] | <acceptance line, shortened> | unverified | <why> |
| T2 | [ ] | <acceptance line, shortened> | not met | <what is missing> |

Checkbox mismatches: <none, or one line per mismatch>
Untracked changes: <none, or files changed by no task>
Non-goals and settled decisions: <respected, or one line per violation>

## Findings

### 1. [CRITICAL] category — Action-oriented title (T3)

- **File:** `path/to/file.ext:42`
- **Evidence:** <exact changed behavior or diagnostic; redact secrets>
- **Issue:** <what is wrong and when it triggers>
- **Impact:** <concrete consequence>
- **Suggestion:** <focused correction; do not apply it>

### 2. [HIGH] category — Title (T1)

...

### 3. [MEDIUM] category — Title (untracked)

...

### 4. [INFO] category — Title (T2)

...

## Validation Run

| Command | Exit | Result |
|---------|------|--------|
| `npm test` | 0 | 152 passed |
| `npm run typecheck` | 0 | clean |

## Review Limits

- <files or checks skipped and why>
- <validation not run and why>
- <base-ref patches that can include pre-existing changes, when applicable>
- <anything that could not be verified>
```

Rules:

- Order the findings `CRITICAL`, `HIGH`, `MEDIUM`, then `INFO`. Number them
  in one sequence across the whole section.
- End each finding title with the task ID in parentheses, or with
  `(untracked)`. Step 11 of `SKILL.md` gives the tag rules.
- Give each finding one root cause. If several symptoms have the same root
  cause, merge them into one finding with one correction.
- If there are no findings, write `No actionable findings.` under
  `## Findings`. Keep every other section.
- Omit table rows that do not apply. Keep every section heading.
- If the review covered everything, `Review Limits` can say `None.`

## Nothing Reviewed

Use this format when you cannot establish the scope. Examples: the resolver
is missing or fails, the base ref is not valid, or `PLAN.md` or `TASKS.md` is
not found. A Nothing Reviewed report is not a clean result.

```markdown
# Implementation Review: <plan-name or "unknown">

Verdict: NOTHING REVIEWED
Base ref: <ref or "working tree">
Scope: none

## Reason

<empty diff, invalid ref, Git failure, missing PLAN.md or TASKS.md, or another
concrete blocker>

## Next action

<the smallest user decision or repository action needed>
```

Do not recommend staging or committing only to make untracked files
visible. A review with a base ref must use `--include-untracked` instead.
