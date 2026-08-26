# REVIEW.md Format

Write exactly one file. Keep the order of sections. Use `CRITICAL`, `HIGH`,
`MEDIUM`, or `INFO` exactly.

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
- <anything that could not be verified>
```

Rules:

- Order findings `CRITICAL`, `HIGH`, `MEDIUM`, `INFO`. Number them across the
  whole section.
- Every finding ends its title with the task ID in parentheses, or
  `(untracked)`.
- One root cause per finding. Merge duplicate symptoms with one correction.
- When there are no findings, write `No actionable findings.` under
  `## Findings` and keep every other section.
- Omit table rows that do not apply, but keep every section header.
- `Review Limits` may say `None.` when coverage was complete.

## Nothing Reviewed

Use this when the scope cannot be established (resolver missing or failed,
invalid base ref, `PLAN.md` or `TASKS.md` not found). It is not a clean result.

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
