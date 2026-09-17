---
name: pter-exp
description: "Experimental agent-teams variant of pter: orchestrate the planner -> plan-to-tasks -> execute -> execution-review chain through named teammates (full Claude Code sessions) with four user gates: plan review, task review, review result, and re-review choice. Requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1."
disable-model-invocation: true
---

# pter-exp

You are the team lead of a plan -> tasks -> execute -> review chain. This is
the experimental agent-teams variant of `pter`. Every phase runs as a named
teammate: a full, independent Claude Code session spawned with the `Agent`
tool plus a `name`. In tmux split-pane mode each teammate gets its own pane,
and the user can click into a pane and talk to that teammate directly. That
is why the planner also runs as a teammate here instead of inline: the user
runs the planner interview inside the planner's own session. You coordinate;
you do not do the phase work yourself.

## Teammate mechanics

- A spawn becomes a teammate only when the `Agent` call has a `name`. Always
  pass `name`. Role names: `planner`, `task-writer`, `executor`, `reviewer`.
  When a role needs a fresh spawn — the teammate is gone, a continuation
  failed, or the user chose a fresh reviewer — append a counter:
  `executor-2`, `reviewer-2`.
- A teammate that finishes its turn goes idle and sends an idle notification
  that contains its final answer. Treat that notification as the phase
  result. Do not poll while a teammate works. The planner is the exception:
  it also stops whenever it waits for the user's answer, so only its `PLAN:
  <absolute path>` notification counts (see Phase 1).
- Teammates do not inherit this conversation. Every spawn prompt must be
  self-contained: skill path, artifact paths, base ref, and constraints.
- One team per session. Teammates cannot spawn their own teammates, and they
  must not spawn background subagents; every spawn prompt repeats this.
- Teammates inherit the lead's permission mode at spawn.
- Shutdown is graceful and can be slow: a teammate finishes its current
  request before it exits. Never kill a teammate's pane or process; use the
  shutdown requests in Done.

## Rules

- Never commit or stage anything. Nothing in this workflow commits. The user
  commits after review.
- Stop at every gate and wait for the user's answer. Do not continue on your
  own, and do not skip a gate.
- Artifacts live in `.artifacts/<plan-name>/`: `PLAN.md`, `TASKS.md`,
  `REVIEW.md`. Track each role's current teammate name; you need it to
  continue that teammate with `SendMessage`.
- Phase boundaries for the task writer and the reviewer are enforced with git
  snapshots. Immediately before every task-writer or reviewer run — a fresh
  spawn or a `SendMessage` continuation — run `git status --porcelain` and
  keep the output. When the idle notification arrives, run it again and
  compare. Only the phase's expected artifact (`TASKS.md` or `REVIEW.md`) may
  change during that phase. The baseline is the state at phase start, so
  pre-existing dirt the phase does not touch never counts as a violation. If
  the user works inside a teammate's pane during a phase, those changes land
  in the same diff; report them like any other unexpected path. On a
  violation, stop the workflow at once: show the user the exact unexpected
  paths, preserve every change exactly as it is, and never revert, restore,
  delete, stage, or commit anything. Do not start the next phase; the user
  decides how to continue. The executor is exempt from this path rule: its
  scope is governed by `TASKS.md`. The planner teammate is governed by the
  planner skill's own write rule.
- The teammate phase skills (`plan-to-tasks`, `execute`,
  `execution-review`) set `disable-model-invocation: true`, so the
  `Skill` tool refuses every model-initiated load. Teammates must not call
  the `Skill` tool for them. Every spawn prompt instead tells the teammate to
  read `~/.claude/skills/<name>/SKILL.md` directly, follow it as its
  operating instructions, and resolve the skill's relative references against
  `~/.claude/skills/<name>/`; the direct read is the intended loading path
  for this workflow. The `planner` skill is the exception: it allows model
  invocation, so the planner teammate loads it with the `Skill` tool.
- To continue an idle teammate, use `SendMessage` with its name. If the
  continuation fails or the teammate is gone, spawn a fresh teammate of the
  same role under the next counter name and pass it the artifact paths and
  the base ref.
- On any other teammate failure — including an idle notification that
  reports an API error — report the failure to the user and ask before
  retrying that phase. Do not retry silently.
- At the start of each phase, if `$TMUX_PANE` is set, rename the tmux window
  through `bash`: `tmux rename-window -t "$TMUX_PANE" "<label>"`. Labels:
  ` Planning`, ` Tasking`, ` Executing`, ` Reviewing`,
  ` Workflow done`. If `$TMUX_PANE` is not set, skip every rename. Claude
  Code manages teammate panes: never split, resize, close, or retitle them.
- Only the team lead runs `plannotator`. Teammates never run it; every spawn
  prompt says so.

## Plannotator gate

Gates 1, 2, and 3 review their artifact in the plannotator browser UI instead
of a chat question. Inputs: the absolute artifact path, the gate label
(`plan`, `tasks`, or `review`), and the gate's chat fallback question. When
preflight found no `plannotator` binary, skip this procedure and ask the chat
fallback question directly.

1. Print the gate's chat summary as the gate describes it. Then tell the user
   that the artifact is open in plannotator, that the browser decision decides
   the gate, and that closing the session falls back to the chat question. If
   the browser did not open, the session URL is in the background task
   output.
2. Build the result path. Run `mkdir -p <artifact dir>/decisions`, then use
   `<artifact dir>/decisions/<gate label>-$(date -u +%Y%m%dT%H%M%SZ).json`.
   Never reuse a path: the CLI refuses an existing file.
3. Run the review through `Bash` with `run_in_background: true`:

   ```
   plannotator annotate <absolute artifact path> --gate --json --result-file <result path>
   ```

   End the turn and wait for the command's exit notification. Do not poll,
   sleep, or read the result file before the command exits.
4. When the notification arrives, read the result file. If it is missing
   (exit code 2, a startup failure, or a missing binary), show the command
   output to the user and ask the gate's chat fallback question instead.
5. Map the decision:
   - `{"decision":"approved"}` without `feedback`: advance to the next phase.
   - `approved` with `feedback`: advance, and pass the notes verbatim into the
     next phase's spawn prompt or message as non-blocking guidance. Do not
     revise the artifact over them.
   - `annotated`: send the `feedback` verbatim to the gate's responsible agent
     as the gate describes. For Gates 1 and 2, run this procedure again on
     the revised artifact with a new result path. Repeat until `approved` or
     `dismissed`.
   - `dismissed`: ask the gate's chat fallback question and follow the answer.

## Phase 0: Preflight

1. Run `printenv CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`. If the output is
   empty, agent teams are disabled: tell the user to run `/pter` (the
   subagent variant) or to enable the flag, and stop.
2. Run `git rev-parse HEAD`. Store the output as the base ref. The executor
   and the reviewer both receive it. If this fails, the directory is not a git
   repository: tell the user and stop.
3. Run `git status --porcelain`. If the output is not empty, the tree is
   dirty: show the user the list and ask whether to continue before you spawn
   anything. Wait for the answer. A dirty start is safe to accept: each phase
   boundary compares against the state at phase start, not a clean worktree,
   so only paths a phase itself changes are checked.
4. Run `command -v plannotator`. If it fails, tell the user once that this run
   uses chat gates, and ask each gate's chat fallback question directly.

## Model gate

Ask once, after preflight and before the plan phase, how to choose the
teammate models. This gate covers all four roles: the planner, the task
writer, the executor, and the reviewer. Offer three modes:

1. **Inherit**: every `Agent` spawn omits `model`; all teammates run on the
   lead session's model.
2. **Predefined**: apply this role-to-model table with no further questions.
   To change the preset, edit this table.

   | Role        | Model   |
   | ----------- | ------- |
   | Planner     | `fable` |
   | Task writer | `opus`  |
   | Executor    | `opus`  |
   | Reviewer    | `fable` |

3. **Pick for this session**: ask one batched `AskUserQuestion` with four
   questions, one per role (planner, task writer, executor, reviewer).
   Options for each role: inherit, `fable`, `opus`, `sonnet`; `haiku` is
   available through the free-text "Other" answer.

Phrase the picks as the current `Agent` tool model options: today's set is
`sonnet`, `opus`, `haiku`, and `fable`, but the installed Claude Code release
is authoritative. Store the resolved role-to-model answers; inherit means the
later `Agent` spawn omits `model`. A teammate keeps its session model for its
whole life; `SendMessage` never changes it, and only a fresh spawn applies a
role's model.

## Phase 1: Plan (teammate)

Rename the window to ` Planning`. Then spawn the planner as a
teammate with that role's model (omit `model` for inherit):

```
Agent({
  subagent_type: "general-purpose",
  name: "planner",
  description: "Run the planner interview",
  model: "<planner model, omitted for inherit>",
  prompt: "Load the planner skill with the Skill tool, passing this request as its args, verbatim: <the user's /pter-exp arguments>. Run the skill's interview with the user directly in your own session; the user answers in your pane, not through the team lead. Do not spawn teammates or background subagents. Do not run plannotator; the team lead owns the review gates. The interview writes .artifacts/<plan-name>/PLAN.md. When the plan file is complete, end your turn and report the path as `PLAN: <absolute path>`."
})
```

Tell the user where the interview runs: in the planner's tmux pane in
split-pane mode, or through the agent panel (select the planner, press
Enter) in in-process mode. The planner stops each time it waits for an
answer, and each stop can send you an idle notification. Treat only a
notification that contains `PLAN: <absolute path>` as the phase result. On
any other planner notification, keep waiting; if nothing moves, remind the
user to answer in the planner's session. Store the exact `PLAN.md` path.

## Gate 1: Plan review

1. Read `PLAN.md`. Show the user the path, the goal, the non-goals, and the
   settled decisions in a short summary.
2. Run the Plannotator gate on `PLAN.md` with the label `plan`. Chat
   fallback: ask the user to proceed to tasks or to give adjustment notes, and
   wait.
3. On `annotated` feedback or chat adjustment notes, `SendMessage` the
   planner teammate with the notes verbatim and the `PLAN.md` path, wait for
   its next `PLAN: <absolute path>` notification, then return to step 1. The
   user can also give the notes directly in the planner's pane; the gate
   re-reads `PLAN.md` either way.
4. On approval, keep any approval notes for the task-writer spawn prompt and
   continue to Phase 2.

## Phase 2: Tasks

Rename the window to ` Tasking`. Snapshot `git status --porcelain`. Then
spawn the task writer as a teammate with that role's model (omit `model` for
inherit):

```
Agent({
  subagent_type: "general-purpose",
  name: "task-writer",
  description: "Convert PLAN.md to TASKS.md",
  model: "<task-writer model, omitted for inherit>",
  prompt: "Read ~/.claude/skills/plan-to-tasks/SKILL.md and follow it as your operating instructions. Do not call the Skill tool for it: the skill disables model invocation, and the direct read is the intended loading path. Resolve the skill's relative references against ~/.claude/skills/plan-to-tasks/. Convert <absolute PLAN.md path> into TASKS.md in the same directory. Do not change PLAN.md or any other file. Do not spawn teammates or background subagents. Do not run plannotator; the team lead owns the review gates. Approval notes from the plan review (non-blocking guidance; omit this sentence when there are none): <plan approval notes>. Report the TASKS.md path as `TASKS: <absolute path>`, the task count, and any blocking assumptions."
})
```

When the idle notification arrives, run `git status --porcelain` again and
diff the snapshot. Only `TASKS.md` may change. On a violation, follow the
boundary rule above.

## Gate 2: Task review

1. Read `TASKS.md`. Show the user the task IDs and titles, the suggested
   sequence, and any open questions the task writer raised.
2. Run the Plannotator gate on `TASKS.md` with the label `tasks`. Chat
   fallback: ask the user for a go or for change notes, and wait.
3. On `annotated` feedback or chat change notes, snapshot git state,
   `SendMessage` the `task-writer` teammate with the notes verbatim, diff the
   snapshot after its idle notification (only `TASKS.md` may change), and
   return to step 1.
4. On approval, keep any approval notes for the executor spawn prompt and
   continue to Phase 3.

## Phase 3: Execute

Rename the window to ` Executing`. Then spawn the executor with that
role's model as a teammate (omit `model` for inherit):

```
Agent({
  subagent_type: "general-purpose",
  name: "executor",
  description: "Implement TASKS.md",
  model: "<executor model, omitted for inherit>",
  prompt: "Read ~/.claude/skills/execute/SKILL.md and follow it as your operating instructions. Do not call the Skill tool for it: the skill disables model invocation, and the direct read is the intended loading path. Resolve the skill's relative references against ~/.claude/skills/execute/. Implement <absolute TASKS.md path> against <absolute PLAN.md path>. Base ref: <base ref>. Do not commit. Do not spawn teammates or background subagents. Do not run plannotator; the team lead owns the review gates. Approval notes from the task review (non-blocking guidance; omit this sentence when there are none): <tasks approval notes>. Mark each task checkbox in TASKS.md as soon as its acceptance checks pass. Final message: tasks completed with IDs, validation commands run with results, blockers or unchecked tasks."
})
```

There is no boundary check for this phase: `TASKS.md` governs its scope. The
user may click into the executor's pane to watch or steer it; that is normal
in this variant and is not a violation.

If the idle notification reports a stall or unchecked tasks without a named
blocker, `SendMessage` the executor exactly once:

```
SendMessage({
  to: "<executor teammate name>",
  message: "Continue from the first unchecked task in <TASKS.md path>. Do not commit. Report tasks completed, validation run, and blockers."
})
```

After that single continuation, report the outcome to the user, whatever it
is. Do not loop.

## Phase 4: Review

Rename the window to ` Reviewing`. Snapshot `git status --porcelain`. Then
spawn the reviewer as a teammate with that role's model (omit `model` for
inherit):

```
Agent({
  subagent_type: "general-purpose",
  name: "reviewer",
  description: "Review the implementation",
  model: "<reviewer model, omitted for inherit>",
  prompt: "Read ~/.claude/skills/execution-review/SKILL.md and follow it as your operating instructions. Do not call the Skill tool for it: the skill disables model invocation, and the direct read is the intended loading path. Resolve the skill's relative references against ~/.claude/skills/execution-review/. Base ref: <base ref>. PLAN.md: <absolute path>. TASKS.md: <absolute path>. Write the review to <same directory>/REVIEW.md and edit nothing else. Do not spawn teammates or background subagents. Do not run plannotator; the team lead owns the review gates. Final message: verdict, findings count per severity, and the REVIEW.md path as `REVIEW: <absolute path>`."
})
```

When the idle notification arrives, run `git status --porcelain` again and
diff the snapshot. Only `REVIEW.md` may change. On a violation, follow the
boundary rule above.

## Gate 3: Review result

1. Read `REVIEW.md`. Show the user the verdict and the findings grouped by
   severity (CRITICAL, HIGH, MEDIUM, INFO) with one line each.
2. Explain the fix-pass scope to the user: every `CRITICAL` and `HIGH`
   finding plus every independently verdict-blocking finding regardless of
   severity: current acceptance `not met` for a checked (`[x]`) task,
   implemented non-goals, or reversed settled decisions. Exclude ordinary
   `MEDIUM` and `INFO` findings and `unverified` acceptance alone. Do not
   inflate severity. State whether the scope is empty.
3. Run the Plannotator gate on `REVIEW.md` with the label `review`. Chat
   fallback: ask the user whether to run one fix pass for this scope or to
   stop here, and wait.
4. Map the decision:
   - `approved` with a non-empty scope: run Phase 5 with the standard message
     plus any approval notes.
   - `approved` with an empty scope: go to Done.
   - `annotated`: run Phase 5 with the standard message plus the annotations
     block. The annotations may exclude, dispute, or add findings.
   - `dismissed`: the chat fallback decides. A fix pass runs Phase 5 with the
     standard message; stop goes to Done.

## Phase 5: Fix pass (only after approval at Gate 3)

Rename the window to ` Executing`. `SendMessage` the executor with the
`REVIEW.md` path:

```
SendMessage({
  to: "<executor teammate name>",
  message: "Fix every CRITICAL and HIGH finding in <absolute REVIEW.md path>, plus every independently verdict-blocking finding regardless of severity: current acceptance not met for a checked ([x]) task, implemented non-goals, or reversed settled decisions. Exclude ordinary MEDIUM and INFO findings and unverified acceptance alone. Do not inflate severity. Keep TASKS.md checkboxes accurate. Never stage or commit. Report what changed and every validation command with its result."
})
```

Append to the message when Gate 3 returned approval notes: `Approval notes
(non-blocking guidance): <approval notes>`. Append when Gate 3 returned
`annotated`: `User annotations on REVIEW.md. They may exclude, dispute, or add
findings and override the standard scope where they conflict: <feedback
verbatim>`.

If the continuation fails, spawn a fresh executor teammate under the next
counter name with the artifact paths and the base ref (the executor role's
model applies again). Report the result. Then run Gate 4; never re-review
automatically.

## Gate 4: Re-review choice (after every approved fix pass)

Ask the user to choose exactly one:

- **Resume the previous reviewer**: rename the window to ` Reviewing`,
  snapshot git state, and `SendMessage` the reviewer teammate (it keeps its
  original model): "Re-review the fixed implementation after the approved fix
  pass. Base ref: <base ref>. PLAN.md: <path>. TASKS.md: <path>. Previous
  REVIEW.md (optional input): <path>. Write the re-review to <same REVIEW.md
  path> and edit nothing else. Final message: verdict, findings count per
  severity, and the REVIEW.md path." Diff the snapshot after its idle
  notification; only `REVIEW.md` may change.
- **Start a fresh reviewer**: rename the window to ` Reviewing` and run
  Phase 4 again with a fresh teammate under the next counter name (the
  reviewer role's model applies again). Tell it to judge the fixed
  implementation independently and to use the previous `REVIEW.md`, if any,
  only as optional context.
- **Stop without re-review**: launch no reviewer. Go to Done.

Wait for the answer. If no reviewer teammate exists (for example the
reviewer never completed), say so and offer only the fresh and stop choices.

After either re-review result, run Gate 3 again with the new `REVIEW.md`. If
the user approves another fix pass, run Phase 5 and this gate again; never
loop without a fresh gate answer.

## Done

Rename the window to ` Workflow done`. Send every live teammate a
shutdown request through `SendMessage`: "The workflow is complete. Please
shut down." A teammate finishes its current request first, so shutdown can
lag; do not wait for panes to close, and never kill a pane. Then give the
final summary:

- The three artifact paths: `PLAN.md`, `TASKS.md`, `REVIEW.md`, and the
  `decisions/` directory when any gate ran in plannotator.
- Validation run, taken from the executor and reviewer results.
- Unresolved findings: MEDIUM and INFO, plus anything not fixed.
- A reminder that nothing was committed. The user reviews and commits.
