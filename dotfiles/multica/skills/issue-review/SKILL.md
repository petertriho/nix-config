---
name: issue-review
description: Review the implementation branch of a Multica issue and post findings as one issue comment. Use when asked to review an issue's implementation. Findings-only — verified defects with file:line and a concrete failure scenario. Never modifies files, the issue description, or issue status.
---

# Issue Review

Review the code changes made for a Multica issue against the plan in its
description, and report verified findings as a single issue comment. This
skill reports; it never fixes.

## Workflow

1. Read the issue and its comments.
   - `multica issue get <id> --output json` for the plan, non-goals, and task
     checklist.
   - `multica issue comment list <id>` to find the engineer's completion
     report, which names the pushed branch.
   - If no comment names a branch and no branch matches
     `agent/<identifier-lowercase>-*` on the remote, post a comment asking for
     the branch name (reply under the trigger comment with `--parent` when
     comment-triggered) and stop.

2. Establish the diff under review.
   - `git fetch origin`, then diff the branch against the default branch with
     merge-base semantics:

     ```sh
     git diff origin/<default-branch>...origin/<branch>
     ```

   - Read enough surrounding code to judge each change in context, not just
     the hunks.

3. Review the diff for defects, most severe first:
   - Correctness: logic errors, broken edge cases, wrong behavior against the
     issue's stated Acceptance checks.
   - Security: injection, missing validation at trust boundaries, secrets in
     code or logs, unsafe file and process handling.
   - Regressions: existing behavior or public contracts the change breaks.
   - Error handling: swallowed failures, missing cleanup, data-loss paths.
   - Concurrency and resources: races, deadlocks, leaks, unbounded growth.
   - Plan conformance: scope creep beyond the issue, non-goals implemented,
     tasks checked off whose Acceptance is not actually met.
   - Maintainability: only concrete, high-confidence issues a maintainer
     would flag, not style preferences.

4. Verify before reporting.
   - Every finding must be grounded in the actual code with a concrete
     failure scenario: inputs or state that lead to wrong output, crash, or
     data loss.
   - Drop speculative findings you cannot trace through the code.
   - Do not report issues linters or the repo's existing validation already
     catch, and do not review unchanged code except where the change breaks
     it.

5. Post exactly one findings comment
   (`multica issue comment add <id> --content-stdin`; reply under the trigger
   comment with `--parent` when comment-triggered):

   ```markdown
   ## Review: <branch> vs <default-branch>

   <one-line verdict: clean, or N findings by highest severity>

   ### Findings

   1. **[severity] <short defect summary>** — `path/to/file:line`
      <what is wrong, and the concrete scenario in which it fails>

   ### Checked

   <brief note of what was reviewed and any validation commands run>
   ```

   - Severity levels: critical (data loss, security, broken main path),
     major (incorrect behavior in realistic use), minor (concrete but low
     impact).
   - If there are no findings, say so plainly and state what was checked; do
     not invent nitpicks to fill the section.

## Prohibitions

- Never modify repository files, commit, push, or create branches.
- Never edit the issue description, change issue status, assign the issue, or
  check task checkboxes.
- Never post more than one findings comment per review pass; follow-ups go in
  replies under the same thread.
