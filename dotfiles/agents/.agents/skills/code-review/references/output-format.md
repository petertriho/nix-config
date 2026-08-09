# Output Format

Return findings in severity order. Keep the response concise enough to scan and
complete enough to act on without rereading the review workflow.

## Findings Present

```markdown
## Code Review Findings

Reviewed: [scope and baseline]

### 1. [HIGH] category — Action-oriented title

- **File:** `path/to/file.ext:42`
- **Scope relation:** Introduced or worsened by this diff, or pre-existing but
  necessary to explain the reviewed change's risk.
- **Evidence:** The exact changed behavior, invariant, call path, or diagnostic that
  demonstrates the problem. Redact any secret-like values.
- **Issue:** What is wrong and the conditions that trigger it.
- **Impact:** The concrete correctness, security, reliability, or maintenance
  consequence.
- **Suggestion:** A focused correction. Do not apply it during this skill.
- **Validation:** Optional command, test, diagnostic, or source check used to verify
  the finding.

### 2. [MEDIUM] category — Action-oriented title

- **File:** `path/to/other.ext:18`
- **Scope relation:** ...
- **Evidence:** ...
- **Issue:** ...
- **Impact:** ...
- **Suggestion:** ...
- **Validation:** ...

## Review Limits

- **Batches:** [completed/total plus reviewed and unreviewed groups, when batched.]
- **Skipped:** [files or groups and reasons.]
- **Validation:** [tests not run or context that could not be verified.]
```

Rules:

- Remove template lines that do not apply; do not invent batches, skipped files,
  or validation limits merely to fill the format.
- Use `CRITICAL`, `HIGH`, `MEDIUM`, or `INFO` exactly.
- Point to the smallest useful line from the review scope's source of truth. For a
  staged review, prefer index lines or cached-hunk context when the working tree
  differs. For deleted code, identify the file and say the evidence is in the
  deletion patch.
- Never reproduce credential, token, key, cookie, or other secret-like values.
  Identify the kind and location and redact the value.
- Keep one root cause per finding. Combine duplicate symptoms when one correction
  addresses them.
- Do not bury CRITICAL or HIGH findings below summary prose.
- Include `Review Limits` whenever coverage was incomplete. Omit it only when
  there are no meaningful limits to disclose.

## No Findings

```markdown
## Code Review Findings

No actionable findings.

Reviewed: [scope and baseline]

## Review Limits

- [Anything not inspected or validated.]
```

Do not manufacture INFO findings to avoid a clean result. A clean result means no
actionable issue was found in the inspected scope, not that the entire repository
is proven correct.

## Nothing Reviewed

Use this when the requested scope is empty, invalid, unreadable, or cannot be
established safely. It is not a clean review result.

```markdown
## Code Review Status

Nothing reviewed.

- **Scope:** [requested scope and baseline]
- **Reason:** [empty diff, invalid ref, Git failure, unresolved conflict, or another
  concrete blocker]
- **Next action:** [the smallest user decision or repository action needed]
```

Do not say “No actionable findings” when no code was inspected.

## Report-Only Contract

- Do not edit or stage files.
- Do not create `.artifacts` or `REVIEW.md` files.
- Do not run fixers, snapshot updates, generators, migrations, deploys, or
  credentialed or stateful integration tests unless the user explicitly authorizes
  the side effect.
- If the user asks to fix findings, stop the review, summarize them, and wait for
  explicit approval before switching to an implementation workflow.
