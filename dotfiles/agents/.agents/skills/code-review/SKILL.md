---
name: code-review
description: Review current or staged Git diffs, ref comparisons, PRs or merge requests, patches, or named files for localized correctness, security, regression, contract, error-handling, concurrency or resource, and concrete maintainability findings. Use for code review, diff or patch review, “look over my changes,” “sanity-check this patch,” or report-only findings requests. Never modify files. Do not use for architecture, ownership, testability, navigability, deletion, or refactoring-opportunity audits; simplification edits; or requests to fix, apply, address, or resolve review feedback.
disable-model-invocation: true
---

# Code Review

Review changed code and return findings. This is a report-only workflow. Do not
edit files, apply fixes, stage changes, or create review artifacts while this
skill is active. A later fix or save request must use a separate workflow.

## References

Read these bundled references when needed:

- `references/diff-scope.md`: resolver invocation and the JSON fields consumed by
  this workflow. Read this before resolving a Git-backed review.
- `references/review-checklists.md`: severity definitions, common checks, and
  language-specific review prompts. Read before evaluating findings.
- `references/output-format.md`: required response structure. Read before the
  final response.

## Boundaries

- Use this skill for current changes, staged changes, a comparison against a ref,
  or explicitly named files.
- Focus on correctness, security, regressions, contracts, error handling,
  concurrency, resources, and diff-local maintainability risks with a concrete
  failure or drift mode.
- Keep broad ownership, module-boundary, navigability, and deletion audits with
  `architecture-review`.
- Do not change code under this skill. If the user asks to fix findings, stop the
  review, summarize the actionable findings, and wait for explicit approval before
  switching to `implement` as a separate workflow.
- Keep behavior-preserving cleanup of changed code with `simplify`.
- Do not run this as a mandatory post-edit gate when the user did not ask for a
  review.

## Workflow

1. **Frame the review.**
   - Identify whether the user requested default uncommitted changes, staged
     changes, `--ref=<ref>`, or named paths.
   - If the request is too broad to review responsibly, narrow it with one
     focused question or review in explicit batches and disclose the limit.

2. **Resolve scope without guessing.**
   - Follow `references/diff-scope.md`.
   - Never silently substitute `HEAD~1`, another ref, or unstaged changes when
     the requested scope is empty or invalid.
   - If no files are in scope or the scope cannot be established, use the
     “Nothing Reviewed” format and stop.

3. **Build project context.**
   - Read applicable `AGENTS.md`, `CLAUDE.md`, README files, package/config files,
     and repository-specific review or test guidance.
   - For a diff-backed review, read the patch before judging the final file. The
     review target is the behavior introduced or changed by that patch.
   - For a named-file review with no patch, mark the scope as whole-file, read the
     current contents directly, and treat all current code in that path as in
     scope.

4. **Inspect representative context.**
   - Read the changed functions, classes, modules, or configuration blocks.
   - Follow relevant call sites, contracts, schemas, and tests when needed to
     determine whether a suspected issue is real.
   - Use diagnostics, tests, or static analysis as evidence when available, but
     verify findings against source behavior instead of copying tool output.
   - Prefer read-only validation. Do not run fixers, snapshot updates, generators,
     migrations, deploys, credentialed or stateful integration tests, or commands
     known to rewrite tracked files unless the user explicitly authorizes that
     side effect.

5. **Discover, then filter, candidate findings.**
   - Make a broad candidate pass using `references/review-checklists.md`.
   - Keep a finding only when it identifies a concrete problem, points to exact
     evidence, explains impact, and offers a plausible correction.
   - In a diff-backed review, prefer issues introduced or worsened by the reviewed
     change. Mention a nearby pre-existing issue only when it is necessary to
     explain the changed code's risk, and label it as pre-existing.
   - In a named-file whole-file review, all current contents are in scope; do not
     suppress a valid issue merely because no patch introduced it.
   - Drop style preferences, speculative future concerns, duplicate findings,
     and issues already prevented by visible validation or invariants.

6. **Report without modifying.**
   - Use `references/output-format.md`.
   - Order findings by severity: `CRITICAL`, `HIGH`, `MEDIUM`, then `INFO`.
   - Include exact `path:line` references from the scope's source of truth. For a
     staged review, use index content or cached-patch context rather than drifted
     working-tree lines. Use patch context for deleted code.
   - If no actionable findings remain, say so directly.
   - State review limits, skipped files, and validation that was not run.

## Discipline

- Cite code, not intuition.
- Explain the failure mode or maintenance cost, not merely the preferred style.
- Do not inflate severity to make a finding seem important.
- Do not invent findings to avoid returning a clean review.
- Do not edit files, stage changes, or write `.artifacts` output.
- When evidence contains a credential, token, key, or other secret-like value,
  cite its location and kind but redact the value from the report.
