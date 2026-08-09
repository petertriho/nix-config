---
name: simplify
description: Mutating current-diff cleanup. Use only when all are true: the user explicitly wants files edited now; the target is code already changed in the current Git diff, or a whole added or untracked regular file; and behavior and public APIs must stay the same. Typical requests ask to tidy, clean up, polish, reduce nesting or duplication, or improve readability in recent changes. Do not use for “simplify this explanation,” prose editing, suggestion-only simplification or refactoring-opportunity scans, whole-file or subsystem refactors, architecture audits, bug or feature work, or unclear requests without code-edit intent. Repository-wide opportunity audits belong to architecture-review.
---

# Simplify

Improve recently changed code without changing what it does. This is a mutating
workflow; activate it only when the user clearly intends code changes.

## Reference

Read `references/diff-scope.md` before editing. It maps resolver output to editable
regions; this file owns the broader workflow and safety contract.

## Contract

- Preserve observable behavior, public APIs, data formats, side effects, ordering,
  and compatibility requirements.
- Modify only code that was already changed in the baseline patch. Added and
  untracked regular files are wholly in scope; symlinks and submodule pointers
  are not editable whole-file content.
- Read unchanged surrounding code for context, but do not edit it.
- Do not add features, fix unrelated bugs, or perform a broad redesign.
- Keep comments that explain rationale, business rules, non-obvious behavior,
  workarounds, or constraints. Remove only comments that merely repeat the code.
- Do not weaken validation, error handling, security controls, accessibility,
  lifecycle cleanup, or tests merely to reduce line count.
- Do not create `.artifacts` output.

## Behavior Equivalence Gate

Before editing a region, state the observable invariant the simplification must
preserve. Check the applicable dimensions instead of relying on line-by-line
similarity:

- Return values, their concrete types or normalization, public output, serialized data,
  and error types or messages. Control flow can coerce a truthy condition result to a
  real boolean; returning the condition expression directly may expose a non-boolean
  object, so preserve the original coercion explicitly.
- Empty, null, falsy, boundary, and exceptional inputs.
- Ordering, mutation, aliasing, side effects, retries, and idempotency.
- Async timing, cancellation, cleanup, resource ownership, and concurrency.
- Validation, authorization, security controls, accessibility, and compatibility.

If the invariant cannot be established from code, tests, and contracts, skip the
simplification and report the uncertainty.

## Workflow

1. **Confirm intent and scope.**
   - Identify default uncommitted changes, `--staged`, `--ref=<ref>`, or explicit
     paths.
   - If “simplify” refers to prose, an explanation, architecture, or a product
     requirement rather than code edits, do not use this workflow.
   - Follow `references/diff-scope.md` and establish the baseline patch before
     editing. Never fall back to `HEAD~1` or another scope.

2. **Read project guidance.**
   - Read applicable `AGENTS.md`, `CLAUDE.md`, README files, package/config files,
     and local test or formatting conventions.
   - Inspect surrounding code and tests only to understand behavior and project
     patterns.
   - Before the first edit, choose the narrowest relevant validation command. Run it
     against the baseline when possible and record pre-existing failures. Plan to run
     the same command after editing; if it cannot run, record the exact command and
     concrete reason.

3. **Identify concrete simplifications.**
   - Work through the scoped files one at a time.
   - Prefer the first safe rung that improves clarity:
     1. Delete dead, duplicate, or unnecessary code.
     2. Use a language, standard-library, framework, or platform-native feature.
     3. Flatten unnecessary nesting or early-return obvious guard cases.
     4. Clarify misleading local names and make data flow more direct.
     5. Consolidate repeated local logic that has the same behavior.
     6. Retain an abstraction when it hides real domain knowledge, an external
        boundary, lifecycle rules, or a meaningful test seam.
   - Avoid clever compression, nested ternaries, dense expression chains, and
     combining unrelated responsibilities merely to use fewer lines.
   - If a worthwhile change requires editing unchanged code or changing a public
     contract, leave it alone and mention it in the final summary.

4. **Edit within the baseline hunks.**
   - Immediately before editing a regular file, capture its exact contents, file
     mode, content hash, and current patch in context or temporary storage outside
     the repository.
   - After each successful edit, record the expected post-edit content hash so a
     later rollback can detect concurrent changes before restoring anything.
   - Apply the smallest coherent change to one file.
   - Keep every source edit inside the original changed regions. Treat the
     original patch as the authority even when line numbers shift after edits.
   - Do not stage changes.
   - After each file, inspect its diff and remove any formatter, generator, or
     incidental edit outside the allowed regions without overwriting unrelated
     user work.

5. **Validate behavior.**
   - Run the same narrow validation command selected before editing after the related
     changes. If it does not cover the simplified behavior, run one broader relevant
     check at the end.
   - Prefer existing public-interface tests. Do not add speculative tests for
     behavior that did not change.
   - If validation cannot run, state the exact skipped command and concrete reason.
   - If a new regression cannot be resolved inside the original scope, first verify
     that the file still matches the expected post-edit hash. Restore only this
     skill's edits using exact-content replacement or tool-level undo, re-run the
     narrow check when possible, and stop.
   - If the hash does not match, assume concurrent work landed and do not restore or
     overwrite it. Report the conflict. Never use `git checkout`, `git reset`, or
     another broad restore that could overwrite user work.

6. **Audit the final diff.**
   - Re-read every edited diff against the baseline using
     `references/diff-scope.md`.
   - Confirm no unchanged region, public API, generated file, or unrelated user
     change was modified.
   - If the scope audit fails, verify the expected post-edit hash before restoring
     only this skill's edits through exact replacement or tool-level undo.
   - If the hash differs, concurrent work landed. Stop and describe the conflict
     without overwriting the newer work.
   - Confirm the resulting code is easier to understand rather than merely
     shorter.

7. **Summarize.**
   - State which files and changed regions were simplified.
   - Explain the concrete complexity or redundancy removed and why behavior is
     preserved.
   - List validation commands and results.
   - Mention useful simplifications left out because they required broader scope.
   - When no changed code is eligible, state that no files were modified and that a
     wider refactor requires explicit user approval as a separate workflow.

## Stop Conditions

Stop without weakening the contract when:

- The requested diff is empty or the ref is invalid.
- A staged file also has incompatible unstaged edits that make staged hunk
  positions unsafe to modify.
- The simplification requires a behavior or public API change.
- Relevant tests reveal a regression that cannot be resolved within the original
  changed regions.
- Scope cannot be distinguished from unrelated user changes.

Report the blocker and stop. Summarize any useful out-of-scope refactor, then wait
for explicit user approval before switching to `implement` as a separate workflow.
Do not continue this skill with expanded scope.
