---
name: planner
description: Upgrade rough ideas, partial plans, feature concepts, product brainstorms, or implementation sketches into plans that are ready to execute or convert into formal specs. Use whenever the user wants to refine, stress-test, scope, harden, sequence, clarify, or prepare work for implementation, PRDs, spec-driven development, or agent/developer handoff.
---

## Rules

Apply these rules only to the current planning request. Respect the host's
permissions and higher-priority instructions.

- This skill is an interactive interview, not a one-shot answer.
- Do not output a plan or a list of steps until the interview ends.
- Do not use the host's built-in planning flow. In Claude Code, never call
  `EnterPlanMode` or `ExitPlanMode`.
- Save the plan as a file, not only as chat text.
- Do not implement the plan or commit changes.

## Preflight

Before the interview, check the host's visible mode and permissions.

If native plan mode is active, ask the user to switch to normal mode before
you continue. This skill must save the plan outside the host's native plan
file.

If the host denies a permission or blocks a write:

- Do not bypass the restriction.
- Tell the user what the host blocked.
- Wait for the user to resolve the restriction.
- If a write is blocked, keep the interview answers so that you can retry the
  save.

## Workflow

1. Read the project context first.
   - Before you ask questions, read the relevant code and recent commits.
     Also read the files and docs that the user references.
   - If the code can answer a question, read the code. Do not ask the user.
   - In a large codebase:
     - Use broad search or an exploration subagent to find related code and
       established patterns. For example, use opencode's `explore` or Claude
       Code's `Agent` with `subagent_type=Explore`.
     - Wait for each exploration result before you ask a question or save a
       plan that depends on it. If an exploration stops without a result,
       read the files yourself.
     - Verify the plan's claims with direct file evidence.
   - For a revision (the user asks you to change an identified plan):
     - Read the plan and any sibling `TASKS.md` before the interview.
     - Keep its settled decisions unless the user or new evidence changes
       them.
   - Skip code exploration only for product-only or purely conceptual
     requests.

2. Map the decision tree.
   - Include these branches: scope, architecture, edge cases, failure modes,
     success criteria, dependencies, sequencing, and accepted tradeoffs.
   - Start with the decision that has the most effect on later decisions.

3. Interview one question at a time.
   - Ask exactly one question in each turn. Use the host's question tool.
   - Include your recommendation and a short reason in every question.
   - When 2-3 viable approaches have different tradeoffs, prefer a
     multiple-choice question.
   - In Claude Code, use `AskUserQuestion` with 2-3 options. Put your
     recommended option first.
   - If the host has no question tool, ask in plain text. Then end your turn.
   - Wait for the answer before you continue.

4. Walk the decision tree depth-first.
   - Resolve dependencies between decisions before you move to sibling
     decisions.
   - When an answer opens a new branch, resolve that branch before you return
     to the parent decision.
   - Revisit a settled decision only when new information changes its
     tradeoff.
   - Ask about an assumption instead of adopting it silently.

5. Apply YAGNI throughout.
   - Exclude scope that does not serve the goal.
   - Challenge premature generalization.

6. End the interview and assess readiness.
   - End the interview when all major branches are resolved, or when the user
     signals that they want to stop.
   - After the user stops the interview, do not ask more interview questions.
   - A blocker is an open question that blocks implementation.
   - Set `Status: Ready` only when the major decisions are settled and no
     blocker remains.
   - If the interview stopped early, or if a blocker remains, set
     `Status: Draft`.
   - A recommendation without the user's approval is a proposed default, not a
     settled decision. Stopping the interview does not approve unanswered
     recommendations.

7. Save the plan.
   - Use the `.artifacts/` directory in the project root. If there is no
     project root, use the working directory.
   - For a revision:
     - Use the existing path of the plan.
     - Read its latest contents before you edit it.
     - Keep the context that the user wrote and the decisions that the
       revision does not affect.
     - In Handoff Notes, list the tasks that the revision invalidates.
   - For a new plan:
     - Save it to `.artifacts/<plan-name>/PLAN.md`. Use a short kebab-case
       `<plan-name>` that describes the goal.
     - If that directory exists, add an unused suffix such as `-2`, `-3`, or a
       timestamp.
     - Do not infer a revision from a matching goal or directory name.
   - Treat all other plans and artifacts as read-only. In a revision, you can
     also change the existing sibling `TASKS.md` of this plan (step 8).
   - Create the plan directory only if it does not exist.
   - Write the plan in the Final Plan Format.

8. Update existing tasks.
   - Do not create `TASKS.md`. The first agent that implements the plan
     creates it, as the Task Tracking section of the plan says, so that its
     tasks match the final plan.
   - In a revision, if a sibling `TASKS.md` exists, update it in one of these
     ways. Use the format in `../plan-to-tasks/references/tasks-format.md`.
     Resolve this path from the directory of this skill.
     - **Replaced tasks.** Use this way if every task is open (`- [ ]`). No
       agent has started work. Write one open task for each step of the
       revised Implementation Plan. Keep the context that the user wrote.
       Read the file again immediately before you replace it. If a task is
       now claimed or done, append tasks instead.
     - **Appended tasks.** Use this way if a task is claimed (`- [~]`) or
       done (`- [x]`). Other agents can be working on the file at the same
       time:
       - Do not change or remove any existing task line or task block.
       - Read the file again immediately before each edit. Use exact-match
         edits, and never rewrite the whole file.
       - If the file has no Tracking section, add the template above the
         first task.
       - For each new step, and for each step that changes the work of an
         existing task, insert an open task after the last task. Use the next
         unused ID. List the existing tasks that it replaces in its
         `Supersedes` field, and name them in its `Why`.
       - Update Suggested Sequence with an edit to that section only.
   - Before you report success, verify the save:
     - Read the saved plan. Check its path, its status line, its Tasks note,
       its section order, and its Task Tracking section against the Final
       Plan Format.
     - For a revision, compare the saved plan with the latest contents that
       you read. Check that the context that the user wrote and the decisions
       that the revision does not affect remain.
     - If you changed `TASKS.md`, check that it has the Tracking section, and
       that each Implementation Plan step has a task. For appended tasks, also
       check that every line of the `TASKS.md` that you read before your edits
       is still in the file, in the same order.
     - Check that you created or changed no file other than the plan and, in
       a revision, its existing `TASKS.md`.
     - If a check fails, fix the plan or the task file and repeat the checks.

## Final Plan Format

Start the file with a title and `Status: Ready` or `Status: Draft`. For a
draft, state why the plan is not ready immediately below the status.

Below the status, and below the reason for a draft, add this Tasks note
without changes:

```markdown
> **Tasks:** Before you implement this plan, follow the Task Tracking
> section at the end of this plan.
```

Use these sections in this order. Omit a section only if it is clearly
irrelevant. Always include Task Tracking.

1. Goal: a concise statement of the desired outcome.
2. Non-goals: the scope that the plan intentionally excludes.
3. Assumptions: the facts that the plan assumes, and the proposed defaults.
   Label each proposed default as not approved.
4. Settled Decisions:
   - For an interview decision, record the question, your recommendation, the
     user's actual answer, and the accepted tradeoff.
   - For a decision from the brief or an existing plan, cite that source. Do
     not invent interview history.
   - Do not include unanswered recommendations.
5. Proposed Approach: the recommended design or product approach, and why it
   fits.
6. Implementation Plan:
   - Number the steps.
   - For `Ready`, give ordered, executable steps. Do not invent major
     requirements.
   - For `Draft`, give the known steps. Do not invent requirements for
     unresolved decisions.
   - Beside each blocked step, name the blocker that blocks it. A step that
     depends on a blocked step is also blocked.
7. Validation: the tests, reviews, acceptance checks, or success metrics.
8. Risks and Mitigations: the main risks of failure, and how to reduce them.
9. Handoff Notes: context for the next agent, developer, or spec writer.
10. Open Questions:
    - Include only questions that affect scope, architecture, sequencing,
      risk, or implementation cost.
    - Separate blockers from nonblockers.
    - For each blocker, name the affected steps and the decision that
      unblocks them.
11. Task Tracking: write the text below without changes. Then add the
    Tracking template from `../plan-to-tasks/references/tasks-format.md` as a
    fenced `markdown` block. With this section, the plan refers to no skill
    file, so it works on any machine.

    ```markdown
    ## Task Tracking

    Track the implementation of this plan in `TASKS.md` beside this file.
    More than one agent can implement the plan at the same time.

    1. If `TASKS.md` exists, use it, and follow its Tracking section.
    2. Otherwise, write a task list that fits the Implementation Plan. Give
       each task a checkbox line `- [ ] T<n>: <title>`, a `Depends on` field,
       and its acceptance checks. If the user has not answered the blocker
       of a step, add a `Blocked by` field to its task. Put the Tracking
       section below at the top of the file.
    3. Create the file with a command that fails if the file exists, for
       example with `set -o noclobber`. Another agent can create it at the
       same time. If the command fails, use the existing file.
    4. Claim your first task, as the Tracking section says.
    ```

## Final Response

After you verify the save, report:

- `PLAN: <absolute path>` on its own line.
- If you changed `TASKS.md`, `TASKS: <absolute path>` on its own line.
- `Status: Ready` or `Status: Draft`.
- A short summary of the settled decisions.
- The remaining blockers, or `Blockers: None` if there are none.
- After a revision with appended tasks, the IDs of the tasks that you added
  and the IDs that they supersede.

If the save or the verification fails, report the failure and the intended
paths. Do not include the `PLAN:` or `TASKS:` line.

End the planning request after this response.
