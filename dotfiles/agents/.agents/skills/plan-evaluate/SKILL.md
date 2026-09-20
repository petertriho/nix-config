---
name: plan-evaluate
description: "Evaluate PLAN.md against repository evidence before tasking and write EVALUATION.md. Use for /peter evaluation, \"evaluate this plan\", \"fact-check PLAN.md\", or \"is this plan ready for tasking\". Not for authoring or revising plans (planner), generating tasks (plan-to-tasks), or reviewing implementations (execution-review)."
disable-model-invocation: true
---

# Plan Evaluate

Independently evaluate the plan with fresh context. Produce an evidence-backed
verdict for user review, not a revised plan.

## Inputs

Require readable `PLAN.md`. Default output: its sibling `EVALUATION.md`, unless
the user supplies an `EVALUATION.md` target.

- Never substitute for an explicitly supplied missing or unreadable plan.
- Without a plan path, select the newest repository-root `.artifacts/`
  directory by directory modification time containing readable `PLAN.md`.
  State the selection in the evaluation.

Empty input or text with neither an identifiable goal nor implementation work
is not evaluable. Never substitute another plan for unusable input.

If no evaluable plan resolves, use Nothing Evaluated from
`references/output-format.md`. Write it only to an explicit output target;
otherwise return that format in chat without creating a file.

## Boundaries

- Write only the `EVALUATION.md` target. Keep plans, tasks, source, tests, and
  configuration unchanged. Never stage or commit.
- Use only read-only file reads, searches, `git log`, `git show`, `readlink`,
  `command -v`, `--help`, `--version`, and script listings.
  Invoke flags only when execution is known or inspected to be read-only;
  otherwise inspect source or mark the claim unverified.
  Never run tests, builds, fixers, formatters, generators, or migrations.
- Judge settled scope, not your preferred design. Challenge a settled
  decision only when evidence refutes its premise. Do not add scope or
  propose alternative designs.

## Workflow

1. **Read the full plan.** Note verified assumptions, unapproved defaults,
   and blockers. Resolve explicit supersession before assessing active decisions
   and steps; superseded text is history, not a contradiction.
   Flag ambiguous supersession rather than choosing silently.
2. **Collect claims throughout the plan.** Number repository and machine
   claims: paths, symbols, signatures, conventions, commands, tool behavior,
   and configuration values. Distinguish current facts from planned changes.
   Planned additions need producing steps, not present existence.
3. **Verify each factual claim directly**, including the planner's "verified" claims.
   Read named files and search named symbols, patterns, and scripts.
   Resolve symlinks (`readlink -f`), re-exports, wrappers, and generation
   sources before judging output.
   - `verified`: cite `path:line` or read-only command output.
   - `refuted`: cite the contradicting evidence.
   - `unverified`: explain why verification was impossible.
     A claim about an external service, runtime, or tool you cannot run is
     `unverified`, not `refuted`.
   Label inference separately from plan statements. Redact secret-like
   values; cite only their kind and location.
4. **Check every active implementation step.**
   - Flag implemented non-goals and reversed settled decisions.
   - Flag settled decisions without a step, except explicitly
     non-implementation decisions.
   - Require steps depending on open questions to reference them.
   - Can a task writer define scope and acceptance without inventing
     requirements? Flag hidden decisions: ambiguous files/interfaces,
     unspecified data shapes, missing error/migration paths, or consequential
     "as appropriate" choices.
5. **Check validation and risks.**
   - Inspect every named command/script, including its working directory and
     script/task-runner definition. Verify existing commands; for planned
     commands, verify creation before use. Record planned checks in Step Checks,
     not as verified existing capabilities.
   - Validation must prove the goal, not merely that code runs.
   - Require a failure-detecting check for every listed risk and risky step.
   - Record code-grounded omitted risks: affected callers, tests, derived
     configuration/generated files, migrations, and platform/sandbox constraints.
6. **Check status consistency and decision provenance.**
   - Flag `Ready` with blocking questions or steps depending on unresolved
     decisions.
   - Flag unapproved defaults recorded as settled or recommendations recorded
     as accepted without the user's answer.
     Use supplied approval evidence; missing interview history is a limit,
     not proof that approval was absent.
   - Require the reason for `Draft` immediately below its status.
   - Report missing essential content in otherwise evaluable plans as findings.
     Report missing or invalid status literally; never invent `Ready` or `Draft`.

## Findings and verdict

- `BLOCKING`: a refuted claim a step depends on; an implemented non-goal or
  reversed settled decision; a contradiction between sections; `Ready` with a
  blocker; or an unapproved default recorded as settled.
- `NOTE`: other concrete impacts on tasking/execution, including unverified
  dependencies, hidden decisions, validation gaps, omitted risks, or settled
  decisions without steps.
- Do not manufacture findings or inflate severity.
- Verdict: `NEEDS REVISION` if any `BLOCKING` finding exists; otherwise `READY`.
  Report the plan's status separately without changing it.
  Evaluation `READY` means no blocking findings under this rubric, not that
  a Draft or unverified dependency is cleared for implementation.

## Output

Read `references/output-format.md` before writing. Follow its exact structure,
including root-cause deduplication and empty sections.

Read back the saved artifact to verify its target and required contents.
After a successful save and verification, report only the verdict, counts per
level, and `EVALUATION: <absolute path>`.
On write or verification failure, report the failure and intended path without
an `EVALUATION:` handoff. An old artifact is not a successful current evaluation.
