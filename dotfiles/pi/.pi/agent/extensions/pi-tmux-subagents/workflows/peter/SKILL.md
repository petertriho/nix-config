---
name: peter-workflow
description: Orchestrate the planner -> plan-evaluate -> plan-to-tasks -> execute -> execution-review chain through tmux workflow roles with four user gates.
---

# Peter workflow

You are the orchestrator of a plan -> evaluate -> tasks -> execute -> review
chain. Each role runs in its own tmux pane. Coordinate the work; do not
perform a role's planning, evaluation, task writing, implementation, or
review yourself.

## Runtime contract

- Read the workflow and run IDs from `<workflow-config>`. Use the exact
  manifest role IDs `planner`, `evaluator`, `task-writer`, `executor`, and
  `reviewer`.
- Use only `workflow_spawn`, `workflow_resume`, `workflow_recover`, and
  `workflow_complete` for lifecycle operations on these roles. Never use
  ordinary `subagent` or `subagent_resume` for a Peter role.
- The lifecycle tools are fire-and-forget. Never poll, sleep, tail session
  files, read session files to check progress, or call status tools while
  waiting. End the turn and wait for the harness to deliver
  `subagent_result` or `subagent_ping`.
- The runtime resolves agents, models, current role sessions, replacement
  sessions, recovery defaults, and write boundaries. Do not store or pass
  child session paths yourself.
- Role primary skills are loaded by Pi's normal skill invocation. Do not
  hardcode Claude skill paths or copy Claude's teammate APIs.
- Read the evaluator assignment from `<workflow-config>`. Evaluation is
  enabled by default, including parent-model mode. Only an explicit saved
  `{ "skip": true }` per-role assignment skips Phase 2 and every re-evaluation.
  Do not ask a second model/skip question or reinterpret model failures as skip.
- Artifacts live in `.artifacts/<plan-name>/`: `PLAN.md`, `EVALUATION.md`
  when enabled, `TASKS.md`, and `REVIEW.md`. Pass exact paths as typed data.
  Declared files remain protected even from executor `worktree` access.
- Only the orchestrator runs Plannotator, through `workflow_gate`. Every
  role prompt must say: "Do not run Plannotator; the parent owns the gates."
  Preserve executor delegation allowed by the `execute` skill; do not impose
  Claude's blanket teammate delegation prohibition.
- Never commit and never stage. Nothing in this workflow commits or stages;
  the user reviews and commits after the workflow.
- Every role result or ping can include
  `details.workflowWriteBoundary`. If it reports `violated: true`, or the
  content starts with `WORKFLOW WRITE POLICY VIOLATION`, stop immediately.
  Show the exact unexpected paths, preserve every change exactly as it is,
  and never revert, restore, delete, stage, or commit anything. Do not launch
  another role. Call:

  ```text
  workflow_complete({
    runId: "<run id>",
    status: "aborted",
    summary: "Stopped after a workflow write-policy violation; all repository changes were preserved."
  })
  ```

- If the user cancels or explicitly stops outside the normal Gate 3 or Gate 4
  finish choices, launch nothing else, call `workflow_complete` with
  `status: "aborted"`, and give the available artifact summary.
- Stop at every gate and wait for the user's answer. Never infer approval,
  skip a gate, or continue on your own.
- At the start of each phase, if `$TMUX_PANE` is set, rename the current tmux
  window with `bash` (otherwise skip the rename):

  ```bash
  tmux rename-window -t "$TMUX_PANE" "<label>"
  ```

  Labels are exactly ` Planning`, ` Evaluating`, ` Tasking`, ` Executing`,
  ` Reviewing`, and ` Workflow done`.

## Role failure and recovery

When a role result reports a provider or agent error, inspect
`details.failureKind`.

- For `usage` or `retry-exhausted`, call `workflow_recover` with the run ID,
  explicit role ID, and `details.errorMessage` as `failure`. Include the
  latest continuation instruction and relevant typed data (do not send
  evaluation to the task writer). The
  runtime opens the shared recovery and context-fit gates, resolves the
  current session, preserves completed artifacts, and keeps a successful
  replacement model as that role's default for the remainder of this run.
  Recovery never changes the saved workflow preset.
- Preserve every feedback block verbatim in the continuation, recovery, and
  fresh-rollover instructions. Keep the same artifact targets and authorized
  scope; recovery is not a new gate decision. If needed, read the authoritative
  completed gate result file for the full feedback, not a summary.
- For `other`, tell the user the failure and ask whether to retry that role.
  Never retry silently. If approved, use `workflow_resume`; if declined, abort
  the workflow as a terminal user stop.
- Transient network and overload retries already happen inside the child.
  Never create retry loops, fallback chains, or provider switches yourself.
- Relay any `resumeWarnings` to the user. A fresh rollover remains the same
  logical role; the runtime updates its current session and history.

## Plannotator gate

Gates 1, 2, and 3 use browser review when available. Gate 4 is always a chat
choice. Never start a gate while a role is running, or launch a role while a
browser gate is pending. The native tool transports decisions; this skill
decides what each gate authorizes.

1. Print the gate's chat summary. If preflight found no `plannotator`, ask
   that gate's chat fallback directly and wait.
2. Otherwise call the parent-only native tool with the active run ID, safe
   gate label, and declared file slot ID (not a path):

   ```text
   workflow_gate({
     runId: "<run id>",
     gate: "plan",
     artifact: "plan",
     reviewDirectory: true,
     data: {
       plan: "<absolute PLAN.md path>",
       evaluation: "<absolute EVALUATION.md path>"
     }
   })
   ```

   This example is Gate 1 after evaluation. For skipped evaluation use
   `reviewDirectory: false` and omit `evaluation`. Gates 2 and 3 use the
   `tasks` and `review` labels and artifact slots respectively, with
   `reviewDirectory: false`. `data` and `reviewDirectory` are optional;
   `data` contains only declared artifact/ref values, never browser feedback.
3. The tool acknowledges immediately and exposes the session URL when
   available. Tell the user the target is open in Plannotator, that the
   browser decision decides the gate, and that closing it falls back to chat.
   Share the delivered URL if the browser did not open. End the turn and
   wait for the matching `workflow_gate_result`. Do not poll, sleep, run a
   background Bash command, or read the result file before process closure.
4. The runtime creates each unique decision JSON file in the sibling
   `.artifacts/<plan-name>-decisions/` directory, never inside the reviewed
   plan directory. Do not create, reuse, or overwrite result paths yourself.
   Match the active run and attempt; never act on stale or duplicate results.
5. A missing binary, startup failure, failed exit, missing result, invalid
   JSON, unknown decision, or invalid feedback type is not approval. Report
   the failure and ask the gate's chat fallback. A `dismissed` decision also
   requires the chat fallback. Wait for an explicit answer.
6. On `/workflow-resume`, use the saved gate history. An interrupted gate
   requires that gate's chat fallback and a fresh user decision. Never
   reconnect to an orphaned browser process or accept its later output.
   Completed history preserves decisions and notes, but does not authorize
   repeating a phase that already ran.

Decision handling:

- `approved` without feedback advances as that gate defines.
- `approved` with feedback advances with the notes verbatim as non-blocking
  guidance for the next phase. Do not revise the reviewed artifact over
  approval notes. Empty feedback is valid and adds no instruction.
- `annotated` forwards the feedback verbatim to the responsible role:
  planner at Gate 1, task writer at Gate 2, executor at Gate 3. Gates 1 and 2
  repeat browser review after revision, using a new attempt.
- `dismissed` asks the gate's chat fallback; never infer approval from closing
  the browser.

Feedback integrity: keep every character, including line breaks and leading
or trailing whitespace. Do not trim, summarize, merge, deduplicate, or store
feedback in generic data slots. Insert the original string between explicit
`<user-feedback>` and `</user-feedback>` delimiters inside the next role's
task/message, with guidance outside the block. This keeps whitespace internal
even when lifecycle tools trim the whole instruction. The original result
file is authoritative; if a completion message omits oversized feedback,
read the full result after closure before forwarding. Keep the same block
through resume, recovery, and rollover.

Folder feedback begins with `Folder Feedback`, which duplicates the active
document's notes, then `Linked Document Feedback` with headings under absolute
file paths. The per-file sections are authoritative. Forward the entire
feedback unchanged, explain this shape outside the block, and name the files
it covers (normally `PLAN.md` and `EVALUATION.md`).

## Phase 0: Git preflight

1. Run `git rev-parse HEAD`. Store its exact output as `baseRef`. If it fails,
   explain that the directory is not a Git repository, call
   `workflow_complete` with `status: "aborted"`, and stop.
2. Run `git status --porcelain`. If it is non-empty, show the exact dirty
   paths and ask whether to continue before spawning anything. Wait. If the
   user declines or cancels, call `workflow_complete` with
   `status: "aborted"` and stop.
3. A dirty start is safe to accept. Every role boundary compares against the
   repository state at that role's start, so untouched pre-existing dirt does
   not count as a violation.
4. The final base-ref review includes current untracked files and can also
   include tracked or untracked changes that existed before Peter. This
   attribution limit is accepted. The reviewer records it under
   `Review Limits` instead of blocking the review.
5. Run `command -v plannotator` once for this run. If unavailable, notify the
   user once that this run uses chat gates. At each gate ask its fallback
   directly; do not silently bypass approval or repeat this preflight.

## Phase 1: Plan

Rename the window to ` Planning`, then launch:

```text
workflow_spawn({
  runId: "<run id>",
  role: "planner",
  data: {
    baseRef: "<base ref>"
  },
  task: "<the user's request, verbatim>\n\nRun the planner skill interview with the user in this pane. Write the plan to .artifacts/<plan-name>/PLAN.md in this repository. Do not implement or commit. Do not run Plannotator; the parent owns the gates. Report the exact PLAN.md path in the final message as `PLAN: <absolute path>`."
})
```

Wait for the delivered result. Take the absolute `PLAN.md` path from it. If no
path is reported, run `ls -t .artifacts` and select the newest directory
containing `PLAN.md`; tell the user which directory you selected. Once
selected, that exact plan is the evaluation target; never substitute another
plan to recover a failed evaluation.

## Phase 2: Evaluate

If the evaluator assignment is `{ "skip": true }`, say "Evaluation skipped
by saved role assignment." Do not spawn, resume, or recover the evaluator,
do not read a stale `EVALUATION.md`, and proceed to Gate 1 with the plan alone.

Otherwise derive the exact absolute `EVALUATION.md` path beside the selected
`PLAN.md`. Rename the window to ` Evaluating`, then launch:

```text
workflow_spawn({
  runId: "<run id>",
  role: "evaluator",
  data: {
    plan: "<absolute PLAN.md path>",
    evaluation: "<absolute EVALUATION.md path>",
    baseRef: "<base ref>"
  },
  task: "Evaluate <absolute PLAN.md path> against this repository with the plan-evaluate skill. Use only the skill's read-only evaluation commands; do not run tests or builds. Write only <absolute EVALUATION.md path>. Never substitute another plan. Never stage or commit. Do not run Plannotator; the parent owns the gates. Final message: verdict, finding counts per level, and `EVALUATION: <absolute path>`."
})
```

Wait for the delivered result and apply the runtime write-boundary and
failure rules. Require a successful result for this evaluation of the current
plan, an `EVALUATION: <absolute path>` matching the exact target, and a
readable artifact. Missing output or `NOTHING EVALUATED` (including "Nothing
Evaluated") is an evaluation failure, not a successful gate. An old file does
not prove the current evaluation succeeded. Report the problem and ask
whether to retry evaluation or stop. On retry use `workflow_resume` with the
same plan and evaluation targets and the instruction above; on stop call
`workflow_complete` with `status: "aborted"`. Do not silently skip, invent
findings, advance to tasking, or use a different plan.

The evaluator never talks to the planner. Findings reach the planner only
through the user's Gate 1 notes naming them.

## Gate 1: Plan review

1. Read `PLAN.md`. Show its path, plan status, goal, non-goals, and settled
   decisions in a short summary. When evaluation ran successfully, also read
   `EVALUATION.md`: show its path, verdict, refuted and unverified claim
   counts, and findings grouped by BLOCKING and NOTE with one line each.
   `NEEDS REVISION` still reaches this user gate; findings never automatically
   revise the plan or block the gate.
2. Run the Plannotator gate with `gate: "plan"` and `artifact: "plan"`.
   Evaluated path: `reviewDirectory: true`, reviewing the plan directory
   containing `PLAN.md` and `EVALUATION.md`. Skipped path:
   `reviewDirectory: false`, reviewing only `PLAN.md`.
   Chat fallback: ask whether to proceed to tasks or give plan adjustment
   notes, and wait. Notes may include, exclude, or dispute evaluation findings.
3. On `annotated` feedback or chat adjustment notes, resume the planner:

   ```text
   workflow_resume({
     runId: "<run id>",
     role: "planner",
     data: {
       plan: "<absolute PLAN.md path>",
       baseRef: "<base ref>"
     },
     message: "Update PLAN.md only as these user notes ask. Do not run Plannotator; the parent owns the gates. Report `PLAN: <absolute path>` and call subagent_done.\n<user-feedback><verbatim notes></user-feedback>"
   })
   ```

   When evaluation ran, include `evaluation` in the typed data and append:
   "EVALUATION.md at <absolute path> is reference material for the findings
   these notes name. Act only on what the notes ask for; do not adopt other
   findings, and do not edit EVALUATION.md." For directory feedback also
   explain that per-file sections are authoritative and name the files covered,
   without changing the feedback block.
4. Wait for the revised plan. Unless evaluation was skipped, rename the
   window to ` Evaluating` and re-evaluate before repeating Gate 1:

   ```text
   workflow_resume({
     runId: "<run id>",
     role: "evaluator",
     data: {
       plan: "<absolute PLAN.md path>",
       evaluation: "<absolute EVALUATION.md path>",
       baseRef: "<base ref>"
     },
     message: "Re-evaluate the revised plan at <absolute PLAN.md path> with plan-evaluate and only its read-only evaluation commands. Overwrite <absolute EVALUATION.md path> and edit nothing else. Never substitute another plan, stage, or commit. Do not run Plannotator; the parent owns the gates. Final message: verdict, finding counts per level, and `EVALUATION: <absolute path>`."
   })
   ```

   Apply the same boundaries and current-result checks from Phase 2, including
   retry-or-stop on missing output or NOTHING EVALUATED. Never show a stale
   evaluation as fresh. Then repeat Gate 1. In the skipped path, repeat Gate 1
   directly without re-evaluation.
5. On approval, forward any approval notes verbatim as non-blocking guidance
   to the task writer and continue to Phase 3. Evaluation findings the user
   did not act on are accepted; keep them for Done, not task-writing
   instructions. Do not pass `evaluation` in task-writer data or prompts.
6. If the user explicitly stops or cancels, abort the workflow.

## Phase 3: Tasks

Derive the absolute `TASKS.md` path in the same directory as the confirmed
`PLAN.md`. Rename the window to ` Tasking`, then launch:

```text
workflow_spawn({
  runId: "<run id>",
  role: "task-writer",
  data: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    baseRef: "<base ref>"
  },
  task: "Convert <absolute PLAN.md path> into <absolute TASKS.md path> with the plan-to-tasks skill. Do not change PLAN.md, implement, stage, or commit. Do not run Plannotator; the parent owns the gates. Report `TASKS: <absolute path>`, the task count, and any blocking assumptions."
})
```

Append plan approval notes when present: `Approval notes (non-blocking
guidance): <user-feedback><verbatim notes></user-feedback>`. Omit this block
when there are no notes. Do not attach accepted unresolved evaluation findings.
Wait for the delivered result.

## Gate 2: Task review

1. Read `TASKS.md`. Show the task IDs and titles, suggested sequence, and any
   open questions or blocking assumptions.
2. Run the Plannotator gate with `gate: "tasks"`, `artifact: "tasks"`, and
   `reviewDirectory: false`, reviewing `TASKS.md`. Chat fallback: ask the user
   for a go or for task change notes, and wait.
3. On `annotated` feedback or chat change notes, resume the task writer with
   the notes verbatim and repeat this gate after its result and boundary check:

   ```text
   workflow_resume({
     runId: "<run id>",
     role: "task-writer",
     data: {
       plan: "<absolute PLAN.md path>",
       tasks: "<absolute TASKS.md path>",
       baseRef: "<base ref>"
     },
     message: "Update TASKS.md only as these user notes ask. Do not run Plannotator; the parent owns the gates. Report `TASKS: <absolute path>`, the task count, and blocking assumptions.\n<user-feedback><verbatim notes></user-feedback>"
   })
   ```

4. On approval, keep any approval notes for the executor as non-blocking
   guidance and continue to Phase 4.
5. If the user explicitly stops or cancels instead of approving or adjusting,
   abort the workflow.

## Phase 4: Execute

Rename the window to ` Executing`, then launch:

```text
workflow_spawn({
  runId: "<run id>",
  role: "executor",
  data: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    baseRef: "<base ref>"
  },
  task: "Implement <absolute TASKS.md path> against <absolute PLAN.md path> with the execute skill. Base ref: <base ref>. Never stage or commit. Do not run Plannotator; the parent owns the gates. Mark each task checkbox in TASKS.md as soon as its acceptance checks pass. Final message: completed task IDs, validation commands and results, blockers, and unchecked tasks."
})
```

Append task approval notes when present: `Approval notes (non-blocking
guidance): <user-feedback><verbatim notes></user-feedback>`.
Wait for the delivered result.

Handle provider/agent errors under Role failure and recovery, not as an
incomplete-execution retry. If the initial implementation result reports a
stall or unchecked tasks without a named blocker, resume the executor exactly once:

```text
workflow_resume({
  runId: "<run id>",
  role: "executor",
  data: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    baseRef: "<base ref>"
  },
  message: "Continue from the first unchecked task in <absolute TASKS.md path>. Never stage or commit. Do not run Plannotator; the parent owns the gates. Report completed task IDs, validation commands and results, blockers, and unchecked tasks."
})
```

That is the only continuation resume allowed for incomplete initial execution.
After it, report the outcome whatever it is and do not loop. Later
user-approved fix passes are separate from this one-resume limit.

## Phase 5: Review

Derive the absolute `REVIEW.md` path in the same artifact directory. Rename
the window to ` Reviewing`, then launch:

```text
workflow_spawn({
  runId: "<run id>",
  role: "reviewer",
  data: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    review: "<absolute REVIEW.md path>",
    baseRef: "<base ref>"
  },
  task: "Review the implementation with the execution-review skill. Base ref: <base ref>. PLAN.md: <absolute path>. TASKS.md: <absolute path>. Include untracked files in the base-ref scope. Accept that the scope can contain pre-existing worktree changes and record that attribution limit under Review Limits. Write the review to <absolute REVIEW.md path> and edit nothing else. Never stage or commit. Do not run Plannotator; the parent owns the gates. Final message: verdict, findings count per severity, and `REVIEW: <absolute path>`."
})
```

Wait for the delivered result.

## Gate 3: Review result

1. Read `REVIEW.md`.
2. Show the verdict and findings grouped by `CRITICAL`, `HIGH`, `MEDIUM`, and
   `INFO`, with one concise line per finding and a count for every severity.
3. Explain the fix-pass scope to the user: every `CRITICAL` and `HIGH`
   finding plus every independently verdict-blocking finding regardless of
   severity: current acceptance `not met` for a checked (`[x]`) task,
   implemented non-goals, or reversed settled decisions. Exclude ordinary
   `MEDIUM` and `INFO` findings and `unverified` acceptance alone. Do not
   inflate severity. State whether the scope is empty.
4. Run the Plannotator gate with `gate: "review"`, `artifact: "review"`, and
   `reviewDirectory: false`, reviewing `REVIEW.md`. Chat fallback: ask whether
   to run one fix pass for this scope or to stop here. Wait.
5. Map the decision:
   - `approved` with a non-empty scope: run Phase 6 with the standard scope
     and any approval notes as non-blocking guidance.
   - `approved` with an empty scope: go to **Done**, without a fix pass.
   - `annotated`: run Phase 6 with the standard scope plus the annotations.
     They may exclude, dispute, or add findings and override the standard
     scope where they conflict, even when the standard scope is empty.
   - `dismissed` or unavailable review: the explicit chat answer decides.
     One fix pass runs Phase 6; stop goes to **Done** without a fix pass.
6. A cancellation or unrelated terminal stop aborts instead of continuing.

## Phase 6: Approved fix pass

Rename the window to ` Executing`, then resume the executor:

```text
workflow_resume({
  runId: "<run id>",
  role: "executor",
  data: {
    plan: "<absolute PLAN.md path>",
    tasks: "<absolute TASKS.md path>",
    review: "<absolute REVIEW.md path>",
    baseRef: "<base ref>"
  },
  message: "Fix every CRITICAL and HIGH finding in <absolute REVIEW.md path>, plus every independently verdict-blocking finding regardless of severity: current acceptance not met for a checked ([x]) task, implemented non-goals, or reversed settled decisions. Exclude ordinary MEDIUM and INFO findings and unverified acceptance alone. Do not inflate severity. Keep TASKS.md checkboxes accurate. Never stage or commit. Do not run Plannotator; the parent owns the gates. Report what changed and every validation command with its result."
})
```

Append approval notes when present: `Approval notes (non-blocking guidance):
<user-feedback><verbatim notes></user-feedback>`. For `annotated`, instead
append: `User annotations on REVIEW.md. They may exclude, dispute, or add
findings and override the standard scope where they conflict:
<user-feedback><verbatim feedback></user-feedback>`.
Preserve this exact scope and feedback through any recovery or rollover.
Report the result, then run Gate 4. Never re-review automatically.

## Gate 4: Re-review choice

After every approved fix pass, ask the user to choose exactly one:

- `Resume the previous reviewer`
- `Start a fresh reviewer`
- `Stop without re-review`

Wait for the answer. The runtime owns reviewer session paths, so never ask the
user for one and never pass one.
If no previous reviewer session exists, explain this and offer only fresh
reviewer and stop.

- **Resume the previous reviewer**: rename the window to ` Reviewing` and
  call:

  ```text
  workflow_resume({
    runId: "<run id>",
    role: "reviewer",
    data: {
      plan: "<absolute PLAN.md path>",
      tasks: "<absolute TASKS.md path>",
      review: "<absolute REVIEW.md path>",
      baseRef: "<base ref>"
    },
    message: "Re-review the fixed implementation after the approved fix pass. Base ref: <base ref>. PLAN.md: <absolute path>. TASKS.md: <absolute path>. Previous REVIEW.md (optional input): <absolute path>. Include untracked files in the base-ref scope. Accept that the scope can contain pre-existing worktree changes and record that attribution limit under Review Limits. Write the re-review to the same REVIEW.md path and edit nothing else. Never stage or commit. Do not run Plannotator; the parent owns the gates. Final message: verdict, findings count per severity, and `REVIEW: <absolute path>`."
  })
  ```

  Do not pass a model override. The saved reviewer selection, primary-skill
  change notice, and 65% context-fit/rollover gate continue to apply.

- **Start a fresh reviewer**: rename the window to ` Reviewing` and call:

  ```text
  workflow_spawn({
    runId: "<run id>",
    role: "reviewer",
    data: {
      plan: "<absolute PLAN.md path>",
      tasks: "<absolute TASKS.md path>",
      review: "<absolute REVIEW.md path>",
      baseRef: "<base ref>"
    },
    task: "Re-review the implementation with the execution-review skill after an approved fix pass. Judge the fixed implementation independently; use the previous REVIEW.md only as optional context. Base ref: <base ref>. PLAN.md: <absolute path>. TASKS.md: <absolute path>. Previous REVIEW.md (optional input): <absolute path>. Include untracked files in the base-ref scope. Accept that the scope can contain pre-existing worktree changes and record that attribution limit under Review Limits. Write the re-review to the same REVIEW.md path and edit nothing else. Never stage or commit. Do not run Plannotator; the parent owns the gates. Final message: verdict, findings count per severity, and `REVIEW: <absolute path>`."
  })
  ```

  The current workflow policy resolves the fresh reviewer's model.

- **Stop without re-review**, and a cancelled chooser, launch no reviewer.
  The explicit stop choice proceeds to **Done**; a cancellation aborts.

After either re-review result, return to Gate 3 with the new `REVIEW.md`.
Another fix pass is allowed only after a fresh Gate 3 decision authorizes it,
and every fix pass is followed by Gate 4. Never loop without a fresh user answer.

## Done

Rename the window to ` Workflow done`. Give the final summary:

- absolute paths for `PLAN.md`, `EVALUATION.md` when produced, `TASKS.md`,
  and `REVIEW.md` (say `not produced` for any missing artifact and explicitly
  state when evaluation was skipped);
- the `.artifacts/<plan-name>-decisions/` directory when browser gates used it;
- executor and reviewer validation commands and outcomes;
- unresolved `MEDIUM` and `INFO` findings plus anything not fixed, and
  evaluation findings the user accepted at Gate 1 without a plan revision;
- a reminder that nothing was staged or committed and the user must review
  and commit.

Then call exactly once:

```text
workflow_complete({
  runId: "<run id>",
  status: "completed",
  summary: "Peter finished; artifacts and validation were summarized and nothing was staged or committed."
})
```
