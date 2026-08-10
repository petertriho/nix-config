---
name: autoresearch
description: Autonomous goal-directed optimization loop in the spirit of Karpathy's autoresearch. Use whenever the user says "autoresearch", wants an agent to iterate unattended or overnight against a measurable target, or wants a number driven up or down through repeated experiments — reduce latency, memory, cost, bundle size, or error count; raise accuracy or a benchmark score; tune parameters, configs, or prompts; "keep trying until X". Each cycle proposes one change, measures it with a locked evaluation harness, keeps improvements, reverts regressions, and repeats until a budget or target is reached. Requires a metric produced by a repeatable command. Do not use for open-ended refactors, feature work, bugs without a reproducible measurement, web or literature research, or single changes the user wants to review before applying.
---

# Autoresearch

Run an unattended modify → measure → keep-or-revert loop against a fixed metric.
This is a mutating workflow that commits and reverts on its own branch; activate it
only when the user wants the agent to iterate without supervision.

## Contract

- The evaluation harness is locked. Never edit the benchmark, scorer, test data,
  fixtures, seeds, or thresholds once the baseline is captured. Changing what
  measures success is how a loop optimizes its own scoreboard instead of the goal.
- Change one thing per iteration. Bundled edits make an outcome unattributable.
- Keep run state on disk, not in context. The loop must survive compaction.
- Correctness gates the metric. A faster or smaller result that fails the check
  command is a loss, not a win.
- Do not stop between iterations to ask whether to continue. The user may be away.
  Budget exhaustion, target achievement, or a stop condition ends the run.
- Never edit outside the repository or push to a remote.

## Setup

1. **Establish the four required inputs.**
   - Metric: a single number, its direction, and the exact extraction rule — the
     line or pattern in the eval output that carries it. Real benchmarks print
     walls of text; if extraction is left vague it can drift between iterations
     and silently corrupt every comparison.
   - Eval command: repeatable, non-interactive, exits nonzero on failure.
   - Check command: correctness gate, usually the existing test suite. If the
     metric cannot be gamed by breaking behavior, say so and skip it explicitly.
   - Budget: max iterations, max wall-clock, and an optional target value.
   - Ask for whichever are missing, one question per turn, with a recommendation.
     Do not infer a metric the user did not agree to.

2. **Confirm the search space.**
   - Name the files the loop may edit and confirm the harness is not among them.
   - If the metric and the editable files are the same file, stop and resolve it.

3. **Require a clean worktree, then branch.**
   - Refuse to start with uncommitted changes; revert would destroy them.
   - Create `autoresearch/<run-name>` from the current HEAD.
   - Create `.artifacts/autoresearch/<run-name>/` for `run.md` and `log.jsonl`.

4. **Write `run.md`.**
   - Record goal, metric with direction and extraction rule, eval command, check
     command, editable files, locked files, budget, and any constraint the user
     stated.
   - This is the contract a future session re-reads to resume the run.

5. **Capture the baseline and noise floor.**
   - Run the check command once first. If it already fails, stop and report it —
     otherwise every iteration is an automatic loss and the budget is spent
     discovering that.
   - Run the eval command at least three times unchanged, five if it is cheap.
     If the metric is deterministic — byte counts, error counts, exact scores —
     one run suffices; record a zero noise band and note why in `run.md`.
   - Record min, median, max. The noise band is `max - min`.
   - An iteration only counts as an improvement if it beats the best median by
     more than the noise band. Without this, the loop chases variance.
   - If the noise band exceeds any plausible improvement, stop and report that the
     harness is too noisy to optimize against.
   - Log the baseline as iteration 0 and report it before looping.

## Loop

Repeat one cycle at a time until a stop condition fires.

1. **Reload state.** Read `run.md` and the tail of `log.jsonl`. Never rely on
   remembering earlier iterations.

2. **Form one hypothesis.** State what you expect to change and why, in terms of
   the metric. Prefer untried strategy classes over variations of a failed one.
   Do not repeat a change already logged as a loss.

3. **Apply the smallest edit that tests it.** One coherent change, editable files
   only.

4. **Measure.** Run the check command first; a failure is an immediate loss, skip
   the eval. Then run the eval command the same number of times as the baseline
   and take the median.

5. **Decide.**
   - Win: median beats the best median by more than the noise band. Commit with
     the hypothesis in the message and update the best.
   - Loss: anything else, including a tie inside the noise band. Revert with
     `git restore` limited to the files this iteration touched, and delete any
     files it created — `git status --porcelain` lists them. A leftover helper
     file contaminates every later iteration. Never use a broad reset; the
     branch holds the kept wins.
   - Never keep a change because it "should" be faster.

6. **Log.** Append one JSON object per line to `log.jsonl`, shaped like:

   ```json
   {"iter":7,"ts":"2026-08-10T12:31:09Z","hypothesis":"memoize parse table","files":["src/parser.ts"],"metric":41.2,"best":38.9,"noise":1.4,"check":"pass","decision":"loss","commit":null}
   ```

   Use `date -u +%FT%TZ` for `ts`; `commit` is the short hash on a win.

7. **Continue immediately.** Do not summarize and wait.

## Resume

If `.artifacts/autoresearch/<run-name>/run.md` and the run branch both already
exist, this is a resumed run, not a new one. Check out the branch, re-read
`run.md` and `log.jsonl`, confirm the worktree is clean and the locked files
are unchanged since the last logged iteration, and continue the loop from the
logged best. Do not recapture the baseline — the logged baseline and noise band
remain the contract unless the user says the environment changed, in which case
start a fresh run instead.

## Plateau

After three consecutive losses, stop tuning the current approach and switch
strategy class — a different algorithm, a different layer of the stack, a
different resource. Record the switch in `log.jsonl` as a hypothesis. After three
switches with no win, treat the search space as exhausted and stop.

## Stop Conditions

Stop and report when any of these hold:

- The target value is reached, or iteration or wall-clock budget is spent.
- The search space is exhausted per the plateau rule.
- The eval command becomes unreliable — it starts failing for reasons unrelated to
  the edits, or the noise band grows past the improvement being chased.
- An iteration requires editing the harness, changing the metric, or weakening the
  check command to show a win.
- The worktree contains changes this loop did not make.

Never widen the budget, relax the metric, or unlock the harness to keep going.
Report the blocker instead.

## Report

- Best metric versus baseline, as absolute values and percentage, with the noise
  band alongside so the reader can judge significance.
- The kept commits in order, each with the hypothesis it tested.
- Strategy classes tried and rejected, so a later run does not repeat them.
- Where the run stopped and why.
- The branch name and log path. Leave the branch unmerged; merging is the user's
  call.
