---
name: plan-evaluate
description: "Evaluate a finished PLAN.md against the repository before it becomes tasks and write .artifacts/<plan-name>/EVALUATION.md. Use for the evaluate phase of /peter, \"evaluate this plan\", \"fact-check PLAN.md against the code\", or \"is this plan ready for tasking\". Verifies every repository claim with file evidence, checks each step against non-goals and settled decisions, checks step concreteness, validation coverage, and status honesty, and writes one evaluation artifact. Not for writing or revising a plan (planner), converting a plan to tasks (plan-to-tasks), or reviewing an implementation (execution-review)."
disable-model-invocation: true
---

# Plan Evaluate

Evaluate a plan with fresh context before anyone converts it to tasks. The
planner is both author and interviewer; this skill is the independent reader
that checks the plan against the repository and against itself. The result is
one artifact with a verdict and evidence-backed findings for the user's plan
review. It does not revise the plan.

## Inputs

Require a readable `PLAN.md`, usually in `.artifacts/<plan-name>/`. Optional
input: an `EVALUATION.md` target (default: next to `PLAN.md`).

- If an explicitly supplied `PLAN.md` path is missing or unreadable, stop with
  "Nothing Evaluated". Never substitute another path.
- If no path is given, list the repository root's `.artifacts/` directories by
  modification time and select the newest directory with a readable `PLAN.md`.
  State the choice in the evaluation. If none exists, stop with "Nothing
  Evaluated".

On input failure, use the Nothing Evaluated format in
`references/output-format.md`. Write it only to an explicit `EVALUATION.md`
target. Otherwise, report it in the final response without creating a file.

## References

- Before writing: `references/output-format.md` (required structure).

## Boundaries

- Write only `EVALUATION.md`. Never edit `PLAN.md`, `TASKS.md`, source, tests,
  or configuration. Report problems instead.
- Run only read-only commands: file reads, searches, `git log`, `git show`,
  `readlink`, `command -v`, `--help`, `--version`, and script listings. Do
  not run tests, builds, fixers, formatters, generators, or migrations.
- Do not commit or stage.
- Judge the plan the user settled, not the plan you would have written. Do not
  reopen a settled decision on preference; flag it only when evidence refutes
  its premise. Do not propose alternative designs or add scope.
- Do not manufacture findings for a clean plan.

## Workflow

1. **Read `PLAN.md` in full:** status and its reason, goal, non-goals,
   assumptions, settled decisions, proposed approach, implementation plan,
   validation, risks, handoff notes, and open questions. Note the planner's
   own labels: verified assumptions, unapproved defaults, blockers.
2. **Collect claims.** A claim is any statement about the repository or the
   machine that the plan relies on: a file or symbol exists, a function has a
   given signature, a pattern or convention is used, a command or script
   exists, a tool behaves in a stated way, a config value is set. Collect
   them from Assumptions, Proposed Approach, Implementation Plan, Validation,
   and Handoff Notes. Number them.
3. **Verify each claim with direct evidence.**
   - Read the named files. Search for the named symbols, patterns, and
     scripts. Follow indirections to the end: resolve symlinks with
     `readlink -f`, follow re-exports and wrappers, and read the source of
     generated or templated files before judging the generated output.
   - Record `verified` with `path:line` or read-only command output,
     `refuted` with the evidence that contradicts the claim, or `unverified`
     with the reason the check was not possible. A claim about an external
     service, a runtime, or a tool you cannot run is `unverified`, not
     `refuted`.
   - Treat the planner's "verified" label as a claim to re-check, not as
     evidence.
4. **Check each implementation step against the plan's own boundaries.**
   - A step that implements a non-goal or reverses a settled decision is a
     boundary violation.
   - A settled decision that no step carries out is a gap, unless the decision
     is explicitly a non-implementation decision.
   - A step that depends on an open question must reference it.
5. **Check step concreteness.** For each step, ask whether a task writer could
   define scope and acceptance without inventing a requirement. Flag a step
   that hides a decision: unnamed files or interfaces where the code offers
   several candidates, an unspecified data shape, an unstated error or
   migration path, or "as appropriate" wording where the choice matters.
6. **Check validation coverage.**
   - Every named command or script exists in the repository or on the machine.
     Use read-only checks: script tables, task runner files, `command -v`,
     `--help`.
   - The validation proves the goal, not only that the code runs.
   - Every risk in Risks and Mitigations and every risky step has a check
     that would detect its failure.
7. **Check status honesty.**
   - `Status: Ready` with a blocking open question, or with an implementation
     step that depends on an unresolved decision, is dishonest.
   - An unapproved default listed under Settled Decisions, or an interview
     recommendation the plan records as accepted without the user's answer,
     is dishonest.
   - `Status: Draft` must state why directly under the status.
8. **Record omitted risks.** From the code read in step 3, note what the plan
   does not mention but a step would affect: other callers of a changed
   interface, tests that exercise changed behavior, configuration or
   generated files derived from a changed source, migrations, and platform
   or sandbox constraints.
9. **Classify findings.**
   - `BLOCKING`: a `refuted` claim that a step depends on, a step that
     implements a non-goal or reverses a settled decision, an internal
     contradiction between sections, `Status: Ready` with a blocker, or an
     unapproved default recorded as settled.
   - `NOTE`: everything else with concrete impact on tasking or execution: an
     `unverified` claim a step depends on, a step that hides a decision, a
     validation gap, an omitted risk, or a settled decision without a step.
   - Merge duplicate symptoms into one finding with one root cause.
10. **Set the verdict.** `NEEDS REVISION` when any `BLOCKING` finding exists.
    Otherwise `READY`. The verdict does not change the plan's `Status`;
    report both.
11. **Write `EVALUATION.md` exactly per `references/output-format.md`.**
12. **Report only the verdict, finding counts per level, and the path as
    `EVALUATION: <absolute path>`.**

## Discipline

- Cite evidence, not intuition. Every `refuted` result quotes or references
  the contradicting evidence.
- A first look is not a verification. Resolve the whole chain before calling
  a claim refuted.
- Do not inflate a `NOTE` into `BLOCKING` to make the verdict feel earned, and
  do not add `NOTE` findings to fill an empty section.
- Separate what the plan says from what you infer. Label inference.
- Redact secret-like values; cite their kind and location only.
