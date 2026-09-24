---
name: plan-evaluate
description: "Evaluate PLAN.md against repository evidence before tasking and write EVALUATION.md. Use for /peter evaluation, \"evaluate this plan\", \"fact-check PLAN.md\", or \"is this plan ready for tasking\". Not for authoring or revising plans (planner), generating tasks (plan-to-tasks), or reviewing implementations (execution-review)."
disable-model-invocation: true
---

# Plan Evaluate

Evaluate the plan independently, with fresh context. Give the user an
evidence-backed verdict to review. Do not write a revised plan.

## Inputs

The input must be a readable `PLAN.md`. By default, write `EVALUATION.md` in
the same directory as the plan. If the user gives a target path for
`EVALUATION.md`, write to that path instead.

Select the plan:

- If the user gives a plan path, use only that plan.
- If the user gives no plan path, find the directories in `.artifacts/` at
  the repository root that contain a readable `PLAN.md`. Select the directory
  with the newest modification time. State this selection in the evaluation.

An input is not evaluable if it is empty, or if it has no identifiable goal
and no implementation work. Never use another plan in place of an input that
is missing, unreadable, or not evaluable.

If no evaluable plan resolves, use the Nothing Evaluated format in
`references/output-format.md`:

- If the user gave an output target, write the format to that target.
- If the user gave no output target, return the format in chat. Do not create
  a file.

## Boundaries

- Write only the `EVALUATION.md` target. Do not change plans, tasks, source,
  tests, or configuration. Never stage or commit.
- Use only these read-only operations: file reads, searches, `git log`,
  `git show`, `readlink`, `command -v`, `--help`, `--version`, and script
  listings.
- Run a `--help` or `--version` command only if you know, from general
  knowledge or from inspection, that its execution is read-only. Otherwise,
  inspect the source instead, or mark the claim `unverified`.
- Never run tests, builds, fixers, formatters, generators, or migrations.
- Judge the plan against its settled scope, not against the design that you
  prefer. Challenge a settled decision only when evidence refutes its premise.
  Do not add scope. Do not propose alternative designs.

## Workflow

1. **Read the full plan.**
   - Note the assumptions that the plan calls verified, the unapproved
     defaults, and the blockers.
   - If the plan explicitly supersedes earlier text, resolve the supersession
     before you assess the active decisions and steps. Superseded text is
     history, not a contradiction.
   - If a supersession is ambiguous, flag it. Do not choose one version
     silently.
2. **Collect the claims from every section of the plan.**
   - Number each claim about the repository or the machine. Claims include
     paths, symbols, signatures, conventions, commands, tool behavior, and
     configuration values.
   - Separate current facts from planned changes. A planned addition does not
     need to exist now. It needs a step that produces it.
3. **Verify each factual claim directly.** Also verify the claims that the
   plan labels "verified".
   - Read the files that the plan names. Search for the symbols, patterns,
     and scripts that it names.
   - Before you judge a claim, resolve the symlinks (`readlink -f`),
     re-exports, wrappers, and generation sources that it depends on.
   - Give each claim one result:
     - `verified`: cite `path:line` or the output of a read-only command.
     - `refuted`: cite the contradicting evidence.
     - `unverified`: explain why verification was impossible.
   - If a claim is about an external service, runtime, or tool that you
     cannot run, mark it `unverified`, not `refuted`.
   - Label your inferences separately from the statements in the plan.
   - Redact values that look like secrets. Cite only their kind and location.
4. **Check every active implementation step.**
   - Flag a step that implements a non-goal or reverses a settled decision.
   - Flag a settled decision that no step implements. Do not flag a decision
     that is explicitly not an implementation decision.
   - A step that depends on an open question must reference that question.
   - Ask whether a task writer can define the scope and acceptance of the
     step without inventing requirements. If not, flag the hidden decisions.
     Hidden decisions include ambiguous files or interfaces, unspecified data
     shapes, missing error or migration paths, and consequential
     "as appropriate" choices.
5. **Check validation and risks.**
   - Inspect every command and script that the plan names. Include its
     working directory and its definition in the script or task runner.
   - Verify each existing command. For a planned command, verify that a step
     creates it before validation uses it.
   - Record a planned check in Step Checks, not as a verified existing
     capability.
   - Validation must prove that the goal is met, not only that the code runs.
   - Each listed risk and each risky step must have a check that can detect
     its failure.
   - Record the omitted risks that the code shows: affected callers, tests,
     derived configuration or generated files, migrations, and platform or
     sandbox constraints.
6. **Check status consistency and decision provenance.**
   - Flag a `Ready` status if a blocker remains, or if a step depends on an
     unresolved decision.
   - Flag an unapproved default that the plan records as settled. Also flag a
     recommendation that the plan records as accepted without the user's
     answer.
   - Use the approval evidence that you have. Missing interview history is an
     evaluation limit, not proof that approval was absent.
   - A `Draft` status must have its reason immediately below it.
   - If an evaluable plan lacks essential content, report this as a finding.
   - If the status is missing or invalid, report it literally. Never invent
     `Ready` or `Draft`.

## Findings and verdict

Use `BLOCKING` for these findings:

- A refuted claim that a step depends on.
- A step that implements a non-goal or reverses a settled decision.
- A contradiction between sections.
- A `Ready` status with a blocker.
- An unapproved default that the plan records as settled.

Use `NOTE` for other findings with a concrete effect on tasking or execution.
These include unverified dependencies, hidden decisions, validation gaps,
omitted risks, and settled decisions without a step.

Do not manufacture findings. Do not raise a finding above the level that this
rubric gives it.

Set the verdict:

- If there is a `BLOCKING` finding, the verdict is `NEEDS REVISION`.
- Otherwise, the verdict is `READY`.

Report the plan status separately, and do not change it. The verdict `READY`
means that the plan has no `BLOCKING` findings under this rubric. It does not
clear a `Draft` plan or an unverified dependency for implementation.

## Output

Before you write, read `references/output-format.md`. Follow its exact
structure, including its rules for root-cause deduplication and empty
sections.

After you write the file, read it back. Verify its path and its required
contents.

- If the write and the verification succeed, report only the verdict, the
  number of findings at each level, and `EVALUATION: <absolute path>`.
- If the write or the verification fails, report the failure and the
  intended path. Do not give the `EVALUATION:` handoff line. An old
  `EVALUATION.md` is not a successful current evaluation.
