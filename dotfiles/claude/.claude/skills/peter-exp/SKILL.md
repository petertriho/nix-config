---
name: peter-exp
description: "Experimental agent-teams variant of peter: orchestrate the planner -> plan-evaluate -> plan-to-tasks -> execute -> execution-review chain through named teammates (full Claude Code sessions) with four user gates: plan review, task review, review result, and re-review choice. Requires CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1."
disable-model-invocation: true
---

# peter-exp

You are the team lead of a plan -> evaluate -> tasks -> execute -> review
chain. This is the experimental agent-teams variant of `peter`. Every phase
runs as a named teammate: a full, independent Claude Code session spawned with
the `Agent` tool plus a `name`. In tmux split-pane mode each teammate gets its
own pane, and the user can click into a pane and talk to that teammate
directly. That is why the planner also runs as a teammate here instead of
inline: the user runs the planner interview inside the planner's own session.
When the model gate sets a role to `pi`, that role runs as a pi subagent in
its own tmux pane instead (see pi roles). You coordinate; you do not do the
phase work yourself.

## Teammate mechanics

- A spawn becomes a teammate only when the `Agent` call has a `name`. Always
  pass `name`. Role names: `planner`, `evaluator`, `task-writer`, `executor`,
  `reviewer`. When a role needs a fresh spawn — the teammate is gone, a
  continuation failed, or the user chose a fresh reviewer — append a counter:
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

## Rules

- Never commit or stage anything. Nothing in this workflow commits. The user
  commits after review.
- Stop at every gate and wait for the user's answer. Do not continue on your
  own, and do not skip a gate.
- Artifacts live in `.artifacts/<plan-name>/`: `PLAN.md`, `EVALUATION.md`,
  `TASKS.md`, `REVIEW.md`. Track each role's current handle: the teammate
  name of a Claude teammate, or the subagent id of a pi role. You need it to
  continue that role with `SendMessage` or `pi-subagent send`.
- Gate decision files live beside the plan directory in
  `.artifacts/<plan-name>-decisions/`, never inside it: the Gate 1 folder
  review lists every file in the plan directory, and decision JSON files
  would clutter it.
- Phase boundaries for the evaluator, the task writer, and the reviewer are
  enforced with git snapshots. Immediately before every evaluator,
  task-writer, or reviewer run — a fresh spawn or a `SendMessage`
  continuation — run `git status --porcelain` and keep the output. When the
  idle notification arrives, run it again and compare. Only the phase's
  expected artifact (`EVALUATION.md`, `TASKS.md`, or `REVIEW.md`) may change
  during that phase. The baseline is the state at phase start, so
  pre-existing dirt the phase does not touch never counts as a violation. If
  the user works inside a teammate's pane during a phase, those changes land
  in the same diff; report them like any other unexpected path. On a
  violation, stop the workflow at once: show the user the exact unexpected
  paths, preserve every change exactly as it is, and never revert, restore,
  delete, stage, or commit anything. Do not start the next phase; the user
  decides how to continue. The executor is exempt from this path rule: its
  scope is governed by `TASKS.md`. The planner teammate is governed by the
  planner skill's own write rule.
- The teammate phase skills (`plan-evaluate`, `plan-to-tasks`, `execute`,
  `execution-review`) set `disable-model-invocation: true`, so the
  `Skill` tool refuses every model-initiated load. Teammates must not call
  the `Skill` tool for them. Every spawn prompt instead tells the teammate to
  read `~/.claude/skills/<name>/SKILL.md` directly, follow it as its
  operating instructions, and resolve the skill's relative references against
  `~/.claude/skills/<name>/`; the direct read is the intended loading path
  for this workflow. The `planner` skill is the exception: it allows model
  invocation, so the planner teammate loads it with the `Skill` tool.
- To continue an idle teammate, use `SendMessage` with its name, or
  `pi-subagent send` with its stored id for a pi role. If the continuation
  fails or the teammate is gone, spawn a fresh teammate of the same role
  under the next counter name and pass it the artifact paths and the base
  ref. For a pi role, the fresh spawn is a new `pi-subagent spawn` with the
  next counter name as `--name`.
- On any other teammate failure — including an idle notification that
  reports an API error — report the failure to the user and ask before
  retrying that phase. Do not retry silently.
- At the start of each phase, if `$TMUX_PANE` is set, rename the tmux window
  through `bash`: `tmux rename-window -t "$TMUX_PANE" "<label>"`. Labels:
  ` Planning`, ` Evaluating`, ` Tasking`, ` Executing`,
  ` Reviewing`. A rename turns off tmux automatic renaming for the window. At
  Done, reset the window name so tmux manages it again:
  `tmux set-option -w -u -t "$TMUX_PANE" automatic-rename`. If `$TMUX_PANE`
  is not set, skip every rename and the reset. Claude Code manages teammate
  panes: never split, resize, close, or retitle them. Exception: pi panes are
  managed by `pi-subagent`, which opens, titles, and closes them.
- Only the team lead runs `plannotator`. Teammates never run it; every spawn
  prompt says so.

## pi roles

A role whose model value is `pi`, `pi:<provider/model>`, or
`pi:<provider/model>:<thinking>` runs as a pi subagent through the
`pi-subagent` script instead of the `Agent` tool. A pi role is not a
teammate: `pi-subagent` opens its pane beside this one, and the user can
watch it or type into it. pi roles exist only when the Phase 0 pi check
passed.

- Spawn: run `pi-subagent spawn` in the foreground with the role name as
  `--name` and the pi prompt on stdin through a quoted heredoc. For
  `pi:<value>`, add `--model <value>` with everything after `pi:`. For plain
  `pi`, omit `--model`; pi's defaults apply. The heredoc is mandatory: the
  prompts contain backticks and gate notes pass verbatim, so a double-quoted
  argument would run command substitution. The command prints the subagent
  id. Store it as the role's handle.
- Result: run `pi-subagent wait <id>` through `Bash` with
  `run_in_background: true` and end the turn. The result arrives as a Bash
  exit notification, not as an `Agent` result: stdout is pi's final message,
  and stderr ends with a `pi-subagent:` trailer. Exit 0 is the phase result
  (the planner adds the `PLAN:` rule of Phase 1). Any other exit code is a
  teammate failure (1: a stop reason other than `stop`; 2: pi or its pane
  exited), and for a continuation it is a failed continuation. Do not poll,
  sleep, or read the pi state files.
- Continuation: run `pi-subagent send <id> - <<'EOF'`, the same message as the
  `SendMessage` branch, and `EOF`, through `Bash` with
  `run_in_background: true`. It pastes into the live pane, or reopens the
  session in a new pane with the same model. The result arrives as for
  `wait`.
- Prompt: adapt the Claude prompt, do not copy it. The skill path is
  `~/.agents/skills/<name>/SKILL.md`, the prompt says "Read the file directly
  and follow it as your operating instructions; do not run `/skill:<name>`.",
  and it says "Do not spawn subagents."
- The boundary snapshot rule is unchanged: snapshot before the spawn or the
  `send`, and diff when the Bash exit notification arrives. The planner stays
  exempt: run no snapshot check around planner `wait` returns.
- pi panes stay open after their phase. Done lists them.

## Plannotator gate

Gates 1, 2, and 3 review their artifact in the plannotator browser UI instead
of a chat question. Inputs: the absolute target (an artifact file, or for
Gate 1 with an evaluation the plan directory), the gate label (`plan`,
`tasks`, or `review`), and the gate's chat fallback question. When preflight
found no `plannotator` binary, skip this procedure and ask the chat fallback
question directly.

1. Print the gate's chat summary as the gate describes it. Then tell the user
   that the target is open in plannotator, that the browser decision decides
   the gate, and that closing the session falls back to the chat question. If
   the browser did not open, the session URL is in the background task
   output.
2. Build the result path. Run `mkdir -p .artifacts/<plan-name>-decisions`,
   then use
   `.artifacts/<plan-name>-decisions/<gate label>-$(date -u +%Y%m%dT%H%M%SZ).json`
   as an absolute path. Never reuse a path: the CLI refuses an existing file.
3. Run the review through `Bash` with `run_in_background: true`:

   ```
   plannotator annotate <absolute target> --gate --json --result-file <result path>
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

Folder feedback shape: for a directory target, `feedback` starts with a
`Folder Feedback` section that repeats the active document's notes without a
file name, followed by a `Linked Document Feedback` section with one heading
per file under its absolute path. The per-file sections are authoritative.
When forwarding folder feedback, say so and name the files it covers.

## Phase 0: Preflight

1. Run `printenv CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`. If the output is
   empty, agent teams are disabled: tell the user to run `/peter` (the
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
5. Run the pi check: `command -v pi-subagent` and `printenv TMUX_PANE`. The
   check passes when both print a value. Store the result. If it fails, tell
   the user once that pi roles are unavailable in this session and why:
   `pi-subagent` is not on PATH, or this session does not run inside tmux.

## Model gate

Ask once, after preflight and before the plan phase, how to choose the
teammate models. This gate covers all five roles: the planner, the evaluator,
the task writer, the executor, and the reviewer. Offer three modes:

1. **Inherit**: every `Agent` spawn omits `model`; all teammates run on the
   lead session's model.
2. **Predefined**: apply this role-to-model table with no further questions.
   To change the preset, edit this table.

   | Role        | Model   |
   | ----------- | ------- |
   | Planner     | `fable` |
   | Evaluator   | `fable` |
   | Task writer | `opus`  |
   | Executor    | `opus`  |
   | Reviewer    | `fable` |

   The table may name a pi value only when the Phase 0 pi check passed. When
   the check failed and the table names a pi value for a role, tell the user
   that the entry is unavailable in this session and ask for a Claude model
   for that role.

3. **Pick for this session**: ask one batched `AskUserQuestion` with five
   questions, one per role (planner, evaluator, task writer, executor,
   reviewer). When the Phase 0 pi check passed, the options for the planner,
   the task writer, the executor, and the reviewer are inherit, `fable`,
   `opus`, `pi`; `sonnet` and `haiku` are available through the free-text
   "Other" answer. The evaluator question offers inherit, `fable`, `pi`, and
   `skip` instead; `opus`, `sonnet`, and `haiku` are available through
   "Other". A custom pi model, `pi:<provider/model>[:<thinking>]`, is also
   entered through "Other". When the pi check failed, offer no `pi`: the
   options for each role are inherit, `fable`, `opus`, `sonnet`, with `haiku`
   through "Other", and the evaluator question offers inherit, `fable`,
   `opus`, and `skip`, with `sonnet` and `haiku` through "Other".

A role value of `pi`, `pi:<provider/model>`, or
`pi:<provider/model>:<thinking>` runs that role as a pi subagent (see pi
roles). `pi` uses pi's default model and thinking level.

The evaluator role also accepts `skip`. With `skip`, Phase 2 and every
re-evaluation are not run, and Gate 1 shows the plan alone. Put `skip` in the
table to make it the default, or pick it for one session.

Phrase the picks as the current `Agent` tool model options: today's set is
`sonnet`, `opus`, `haiku`, and `fable`, but the installed Claude Code release
is authoritative. Store the resolved role-to-model answers; inherit means the
later `Agent` spawn omits `model`, and a pi value means the later spawn is a
`pi-subagent spawn`. A teammate keeps its session model for its whole life;
`SendMessage` never changes it, a pi role continued with `pi-subagent send`
keeps its model too, and only a fresh spawn applies a role's model.

## Phase 1: Plan

Rename the window to ` Planning`. Then spawn the planner as a
teammate with that role's model (omit `model` for inherit):

```
Agent({
  subagent_type: "general-purpose",
  name: "planner",
  description: "Run the planner interview",
  model: "<planner model, omitted for inherit>",
  prompt: "Load the planner skill with the Skill tool, passing this request as its args, verbatim: <the user's /peter-exp arguments>. Run the skill's interview with the user directly in your own session; the user answers in your pane, not through the team lead. Do not spawn teammates or background subagents. Do not run plannotator; the team lead owns the review gates. The interview writes .artifacts/<plan-name>/PLAN.md. When the plan file is complete, end your turn and report the path as `PLAN: <absolute path>`."
})
```

**If the role is pi:** run this spawn instead of the `Agent` call, then
`pi-subagent wait <id>` in the background (see pi roles):

```
pi-subagent spawn --name planner [--model <provider/model[:thinking]>] - <<'EOF'
The skill file is ~/.agents/skills/planner/SKILL.md. Read the file directly and follow it as your operating instructions; do not run `/skill:planner`. Apply it to this request, verbatim: <the user's /peter-exp arguments>. Run the skill's interview with the user directly in your own pane; the user answers in your pane, not through the team lead. Do not spawn subagents. Do not run plannotator; the team lead owns the review gates. The interview writes .artifacts/<plan-name>/PLAN.md. When the plan file is complete, end your turn and report the path as `PLAN: <absolute path>`.
EOF
```

Tell the user where the interview runs: in the planner's tmux pane in
split-pane mode, or through the agent panel (select the planner, press
Enter) in in-process mode. The planner stops each time it waits for an
answer, and each stop can send you an idle notification. Treat only a
notification that contains `PLAN: <absolute path>` as the phase result. On
any other planner notification, keep waiting; if nothing moves, remind the
user to answer in the planner's session. Store the exact `PLAN.md` path.

For a pi planner, tell the user that the interview runs in the planner's pi
pane. A pi turn can end while the interview waits for the user in the pane,
so inspect each Bash exit notification of `wait` or `send`. Output that
contains `PLAN: <absolute path>` is the phase result. Any other output means
the interview continues: run `pi-subagent wait <id>` again in the
background, and do not relay the output. Run no snapshot check around these
returns. Store the exact `PLAN.md` path.

## Phase 2: Evaluate

Skip this phase when the evaluator role is `skip`. Otherwise rename the
window to ` Evaluating`. Snapshot `git status --porcelain`. Then spawn the
evaluator as a teammate with that role's model (omit `model` for inherit):

```
Agent({
  subagent_type: "general-purpose",
  name: "evaluator",
  description: "Evaluate PLAN.md against the repository",
  model: "<evaluator model, omitted for inherit>",
  prompt: "Read ~/.claude/skills/plan-evaluate/SKILL.md and follow it as your operating instructions. Do not call the Skill tool for it: the skill disables model invocation, and the direct read is the intended loading path. Resolve the skill's relative references against ~/.claude/skills/plan-evaluate/. Evaluate <absolute PLAN.md path> against this repository. Write the evaluation to <same directory>/EVALUATION.md and edit nothing else. Do not spawn teammates or background subagents. Do not run plannotator; the team lead owns the review gates. Final message: verdict, findings count per level, and the EVALUATION.md path as `EVALUATION: <absolute path>`."
})
```

**If the role is pi:** run this spawn instead of the `Agent` call, then
`pi-subagent wait <id>` in the background (see pi roles):

```
pi-subagent spawn --name evaluator [--model <provider/model[:thinking]>] - <<'EOF'
The skill file is ~/.agents/skills/plan-evaluate/SKILL.md. Read the file directly and follow it as your operating instructions; do not run `/skill:plan-evaluate`. Resolve the skill's relative references against ~/.agents/skills/plan-evaluate/. Evaluate <absolute PLAN.md path> against this repository. Write the evaluation to <same directory>/EVALUATION.md and edit nothing else. Do not spawn subagents. Do not run plannotator; the team lead owns the review gates. Final message: verdict, findings count per level, and the EVALUATION.md path as `EVALUATION: <absolute path>`.
EOF
```

When the result arrives, run `git status --porcelain` again and diff the
snapshot. Only `EVALUATION.md` may change. On a violation, follow the boundary
rule above. Store the exact `EVALUATION.md` path.

The evaluator never talks to the planner. Evaluation findings reach the
planner only through the user's Gate 1 decision, which may point the planner
at `EVALUATION.md` for the findings the user names.

## Gate 1: Plan review

1. Read `PLAN.md`. Show the user the path, the plan status, the goal, the
   non-goals, and the settled decisions in a short summary. Unless the
   evaluator was skipped, also read `EVALUATION.md` and show its path, its
   verdict, the count of refuted and unverified claims, and its findings
   grouped by level (BLOCKING, NOTE) with one line each. Do not decide for
   the user: a `NEEDS REVISION` verdict still goes to the gate.
2. Run the Plannotator gate with the label `plan`. When the evaluator ran,
   the target is the plan directory `.artifacts/<plan-name>/`, so `PLAN.md`
   and `EVALUATION.md` are reviewed in one session; annotate the plan text,
   the findings, or both. When the evaluator was skipped, the target is
   `PLAN.md`. Chat fallback: ask the user to proceed to tasks or to give
   adjustment notes, and wait. The notes may include, exclude, or dispute
   evaluation findings.
3. On `annotated` feedback or chat adjustment notes, `SendMessage` the
   planner teammate with the notes verbatim and the `PLAN.md` path, and wait
   for its next `PLAN: <absolute path>` notification. When the evaluator
   ran, add: "EVALUATION.md at <absolute path> is reference material for the
   findings these notes name. Act only on what the notes ask for; do not
   adopt other findings, and do not edit EVALUATION.md." For folder feedback,
   also pass on the folder feedback shape note from the Plannotator gate. The
   user can also give the notes directly in the planner's pane. For a pi
   role, send the same message in the background instead (see pi roles), and
   apply the `PLAN:` rule of Phase 1 to every return:

   ```
   pi-subagent send <id> - <<'EOF'
   <same message>
   EOF
   ```

   Then, unless the evaluator was skipped, re-evaluate: snapshot `git status
   --porcelain` and `SendMessage` the evaluator teammate: "Re-evaluate the
   revised plan at <absolute PLAN.md path> against this repository.
   Overwrite <absolute EVALUATION.md path> and edit nothing else. Final
   message: verdict, findings count per level, and the EVALUATION.md path."
   For a pi role, send the same message in the background instead (see pi
   roles), and diff the snapshot after the Bash exit notification:

   ```
   pi-subagent send <id> - <<'EOF'
   <same message>
   EOF
   ```

   Diff the snapshot after the result; only `EVALUATION.md` may change. Then
   return to step 1.
4. On approval, keep any approval notes for the task-writer spawn prompt and
   continue to Phase 3. Evaluation findings the user did not act on are
   accepted; they go to the Done summary, not to the task writer.

## Phase 3: Tasks

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

**If the role is pi:** run this spawn instead of the `Agent` call, then
`pi-subagent wait <id>` in the background (see pi roles):

```
pi-subagent spawn --name task-writer [--model <provider/model[:thinking]>] - <<'EOF'
The skill file is ~/.agents/skills/plan-to-tasks/SKILL.md. Read the file directly and follow it as your operating instructions; do not run `/skill:plan-to-tasks`. Resolve the skill's relative references against ~/.agents/skills/plan-to-tasks/. Convert <absolute PLAN.md path> into TASKS.md in the same directory. Do not change PLAN.md or any other file. Do not spawn subagents. Do not run plannotator; the team lead owns the review gates. Approval notes from the plan review (non-blocking guidance; omit this sentence when there are none): <plan approval notes>. Report the TASKS.md path as `TASKS: <absolute path>`, the task count, and any blocking assumptions.
EOF
```

When the result arrives, run `git status --porcelain` again and diff the
snapshot. Only `TASKS.md` may change. On a violation, follow the boundary
rule above.

## Gate 2: Task review

1. Read `TASKS.md`. Show the user the task IDs and titles, the suggested
   sequence, and any open questions the task writer raised.
2. Run the Plannotator gate on `TASKS.md` with the label `tasks`. Chat
   fallback: ask the user for a go or for change notes, and wait.
3. On `annotated` feedback or chat change notes, snapshot git state,
   `SendMessage` the `task-writer` teammate with the notes verbatim, diff the
   snapshot after its idle notification (only `TASKS.md` may change), and
   return to step 1. For a pi role, send the same message in the background
   instead (see pi roles), and diff the snapshot after the Bash exit
   notification:

   ```
   pi-subagent send <id> - <<'EOF'
   <same message>
   EOF
   ```
4. On approval, keep any approval notes for the executor spawn prompt and
   continue to Phase 4.

## Phase 4: Execute

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

**If the role is pi:** run this spawn instead of the `Agent` call, then
`pi-subagent wait <id>` in the background (see pi roles):

```
pi-subagent spawn --name executor [--model <provider/model[:thinking]>] - <<'EOF'
The skill file is ~/.agents/skills/execute/SKILL.md. Read the file directly and follow it as your operating instructions; do not run `/skill:execute`. Resolve the skill's relative references against ~/.agents/skills/execute/. Implement <absolute TASKS.md path> against <absolute PLAN.md path>. Base ref: <base ref>. Do not commit. Do not spawn subagents. Do not run plannotator; the team lead owns the review gates. Approval notes from the task review (non-blocking guidance; omit this sentence when there are none): <tasks approval notes>. Mark each task checkbox in TASKS.md as soon as its acceptance checks pass. Final message: tasks completed with IDs, validation commands run with results, blockers or unchecked tasks.
EOF
```

There is no boundary check for this phase: `TASKS.md` governs its scope. The
user may click into the executor's pane to watch or steer it; that is normal
in this variant and is not a violation.

If the result reports a stall or unchecked tasks without a named blocker,
`SendMessage` the executor exactly once:

```
SendMessage({
  to: "<executor teammate name>",
  message: "Continue from the first unchecked task in <TASKS.md path>. Do not commit. Report tasks completed, validation run, and blockers."
})
```

For a pi role, send the same message in the background instead (see pi
roles):

```
pi-subagent send <id> - <<'EOF'
<same message>
EOF
```

After that single continuation, report the outcome to the user, whatever it
is. Do not loop.

## Phase 5: Review

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

**If the role is pi:** run this spawn instead of the `Agent` call, then
`pi-subagent wait <id>` in the background (see pi roles):

```
pi-subagent spawn --name reviewer [--model <provider/model[:thinking]>] - <<'EOF'
The skill file is ~/.agents/skills/execution-review/SKILL.md. Read the file directly and follow it as your operating instructions; do not run `/skill:execution-review`. Resolve the skill's relative references against ~/.agents/skills/execution-review/. Base ref: <base ref>. PLAN.md: <absolute path>. TASKS.md: <absolute path>. Write the review to <same directory>/REVIEW.md and edit nothing else. Do not spawn subagents. Do not run plannotator; the team lead owns the review gates. Final message: verdict, findings count per severity, and the REVIEW.md path as `REVIEW: <absolute path>`.
EOF
```

When the result arrives, run `git status --porcelain` again and diff the
snapshot. Only `REVIEW.md` may change. On a violation, follow the boundary
rule above.

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
   - `approved` with a non-empty scope: run Phase 6 with the standard message
     plus any approval notes.
   - `approved` with an empty scope: go to Done.
   - `annotated`: run Phase 6 with the standard message plus the annotations
     block. The annotations may exclude, dispute, or add findings.
   - `dismissed`: the chat fallback decides. A fix pass runs Phase 6 with the
     standard message; stop goes to Done.

## Phase 6: Fix pass (only after approval at Gate 3)

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

For a pi role, send the same message in the background instead (see pi
roles):

```
pi-subagent send <id> - <<'EOF'
<same message>
EOF
```

If the continuation fails, spawn a fresh executor teammate under the next
counter name with the artifact paths and the base ref (the executor role's
model applies again; for a pi role, a new `pi-subagent spawn`). Report the
result. Then run Gate 4; never re-review automatically.

## Gate 4: Re-review choice (after every approved fix pass)

Ask the user to choose exactly one:

- **Resume the previous reviewer**: rename the window to ` Reviewing`,
  snapshot git state, and `SendMessage` the reviewer teammate (it keeps its
  original model): "Re-review the fixed implementation after the approved fix
  pass. Base ref: <base ref>. PLAN.md: <path>. TASKS.md: <path>. Previous
  REVIEW.md (optional input): <path>. Write the re-review to <same REVIEW.md
  path> and edit nothing else. Final message: verdict, findings count per
  severity, and the REVIEW.md path." For a pi role, send the same message in
  the background instead (see pi roles), and diff the snapshot after the
  Bash exit notification:

  ```
  pi-subagent send <id> - <<'EOF'
  <same message>
  EOF
  ```

  Diff the snapshot after the result; only `REVIEW.md` may change.
- **Start a fresh reviewer**: rename the window to ` Reviewing` and run
  Phase 5 again with a fresh teammate under the next counter name (the
  reviewer role's model applies again). Tell it to judge the fixed
  implementation independently and to use the previous `REVIEW.md`, if any,
  only as optional context.
- **Stop without re-review**: launch no reviewer. Go to Done.

Wait for the answer. If no reviewer handle is stored (for example the
reviewer never completed), say so and offer only the fresh and stop choices.

After either re-review result, run Gate 3 again with the new `REVIEW.md`. If
the user approves another fix pass, run Phase 6 and this gate again; never
loop without a fresh gate answer.

## Done

Reset the window name so tmux manages it again (see the rename rule).
Give the final summary:

- The artifact paths: `PLAN.md`, `EVALUATION.md` (when the evaluator ran),
  `TASKS.md`, `REVIEW.md`, and the `.artifacts/<plan-name>-decisions/`
  directory when any gate ran in plannotator.
- Validation run, taken from the executor and reviewer results.
- Unresolved findings: MEDIUM and INFO from the review, plus anything not
  fixed, plus evaluation findings the user accepted at Gate 1 without a plan
  revision.
- The pi panes of this run, when any role ran on pi: run `pi-subagent list`
  and show the id and pane of each stored pi handle with status `alive`, so
  the user can stop them with `pi-subagent stop <id>`.
- A reminder that nothing was committed. The user reviews and commits.
