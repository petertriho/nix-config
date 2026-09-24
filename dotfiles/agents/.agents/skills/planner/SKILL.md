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
   - Treat all other plans and artifacts, including `TASKS.md`, as read-only.
   - Create the plan directory only if it does not exist.
   - Write the plan in the Final Plan Format.
   - Before you report success, read the saved file to verify its path and
     contents.

## Final Plan Format

Start the file with a title and `Status: Ready` or `Status: Draft`. For a
draft, state why the plan is not ready immediately below the status.

Use these sections in this order. Omit a section only if it is clearly
irrelevant.

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
   - For `Ready`, give ordered, executable steps. Do not invent major
     requirements.
   - For `Draft`, give the known steps. Do not invent requirements for
     unresolved decisions.
   - Beside each blocked step, name the blocker that blocks it.
7. Validation: the tests, reviews, acceptance checks, or success metrics.
8. Risks and Mitigations: the main risks of failure, and how to reduce them.
9. Handoff Notes: context for the next agent, developer, or spec writer.
10. Open Questions:
    - Include only questions that affect scope, architecture, sequencing,
      risk, or implementation cost.
    - Separate blockers from nonblockers.
    - For each blocker, name the affected steps and the decision that
      unblocks them.

## Final Response

After you verify the saved file, report:

- `PLAN: <absolute path>` on its own line.
- `Status: Ready` or `Status: Draft`.
- A short summary of the settled decisions.
- The remaining blockers, or `Blockers: None` if there are none.
- After a revision, each `TASKS.md` that needs review.

If the save or the verification fails, report the failure and the intended
path. Do not include the `PLAN:` line.

End the planning request after this response.
