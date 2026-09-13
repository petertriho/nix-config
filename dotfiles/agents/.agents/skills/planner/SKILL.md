---
name: planner
description: Upgrade rough ideas, partial plans, feature concepts, product brainstorms, or implementation sketches into plans that are ready to execute or convert into formal specs. Use whenever the user wants to refine, stress-test, scope, harden, sequence, clarify, or prepare work for implementation, PRDs, spec-driven development, or agent/developer handoff.
---

## Rules

Apply these rules only to the current planning request. Respect the host's
permissions and higher-priority instructions.

- This skill is an interactive interview, not a one-shot answer.
- Do not output a plan or list of steps until the interview ends.
- Do not use the host's built-in planning flow. In Claude Code, never call
  `EnterPlanMode` or `ExitPlanMode`.
- Save the plan as a file, not only chat text.
- Do not implement the plan or commit changes.

## Preflight

Check the host's visible mode and permissions before interviewing.
If native plan mode is active, ask the user to switch to normal mode before
proceeding. The plan must be saved outside the host's native plan file.

Treat permission denials and blocked writes as blockers. Do not bypass
restrictions. Retain interview answers for a retry after the user resolves
a write blocker.

## Workflow

1. Check project context first.
   - Read relevant code, recent commits, named files, and referenced docs
     before asking planning questions.
   - For revisions, read the plan and any sibling `TASKS.md` before interviewing.
   - For revisions, retain settled decisions unless the user or new evidence
     changes them.
   - In large codebases:
     - Use broad search or an exploration subagent to find related code and
       established patterns.
       Examples: opencode's `explore`, or Claude Code's `Agent` with
       `subagent_type=Explore`.
     - Verify final claims with direct file evidence.
   - Answer code-resolvable questions by reading, not asking.
   - Skip exploration only for product-only or purely conceptual prompts.

2. Map the decision tree.
   - Cover scope, architecture, edges, failure modes, success criteria,
     dependencies, sequencing, and accepted tradeoffs.
   - Start with the decision that most affects downstream choices.

3. Interview one question at a time.
   - Ask exactly one question per turn with the host's question tool.
   - In Claude Code, use `AskUserQuestion` with 2-3 options and your
     recommendation first.
   - Without a ask user question tool, ask in plain text.
   - After a plain-text question, end the turn.
   - Wait for the answer before continuing.
   - Include your recommendation and brief rationale in every question.
   - Prefer multiple choice when 2-3 viable approaches have distinct
     tradeoffs.

4. Walk the tree depth-first.
   - Resolve dependencies before sibling decisions.
   - Explore new branches before returning to the parent.
   - Revisit settled answers only when new information changes the tradeoff.
   - Ask about assumptions rather than silently adopting them.

5. Apply YAGNI throughout.
   - Exclude scope that does not serve the goal.
   - Challenge premature generalization.

6. End the interview and assess readiness.
   - Stop when all major branches are resolved or the user signals enough.
   - Do not ask further interview questions after the user stops.
   - Use `Ready` only when major decisions are settled and no
     unresolved question blocks implementation.
   - Use `Draft` after an early stop or while a blocking decision remains.
   - Treat unapproved recommendations as proposed defaults, not approved decisions.
     Stopping does not approve unanswered recommendations.

7. Save the plan.
   - Resolve `.artifacts/` from the project root, or the working directory
     if no project root exists.
   - For an explicit revision:
     - Use the identified plan's existing path.
     - Read its latest contents before editing.
     - Preserve user-authored context and unaffected decisions.
     - Record tasks invalidated by the revision in Handoff Notes.
   - For a new plan:
     - Use `.artifacts/<plan-name>/PLAN.md` with a concise, goal-based kebab-case name.
     - If the directory exists, choose an unused suffix such as
       `-2`, `-3`, or a timestamp.
     - Do not infer a revision from matching goals or directory names.
   - Keep all other plans and artifacts, including `TASKS.md`, read-only.
   - Create the chosen directory only if needed.
   - Write the plan using Final Plan Format.
   - Read back the saved file to verify its path and contents before reporting success.

## Final Plan Format

Start with a title and `Status: Ready` or `Status: Draft`.
For drafts, state why the plan is not ready immediately below the status.

Keep these sections in order, omitting only clearly irrelevant sections:

1. Goal: the concise desired outcome.
2. Non-goals: intentionally excluded scope.
3. Assumptions: assumed facts and explicitly labeled, unapproved defaults.
4. Settled Decisions:
   - For interviews: question, recommendation, actual user answer, and accepted tradeoff.
   - For decisions from the brief or an existing plan: source attribution,
     not invented interview history.
   - Exclude unanswered recommendations.
5. Proposed Approach: the recommended design or product approach and why it fits.
6. Implementation Plan:
   - `Ready`: ordered executable steps without invented major requirements.
   - `Draft`: known steps without invented unresolved requirements.
   - Reference blocking open questions beside blocked steps.
7. Validation: tests, reviews, acceptance checks, or success metrics.
8. Risks and Mitigations: main failure risks and ways to reduce them.
9. Handoff Notes: context for the next agent, developer, or spec writer.
10. Open Questions:
    - Include only questions affecting scope, architecture, sequencing, risk,
      or implementation cost.
    - Separate blockers from nonblockers.
    - For each blocker, name affected steps and the decision needed to
      unblock them.

## Final Response

After verifying the save, report:

- `PLAN: <absolute path>` on its own line.
- `Status: Ready` or `Status: Draft`.
- A short summary of settled decisions.
- Remaining blockers, or `Blockers: None` if none.
- Any `TASKS.md` needing review after a revision.

If saving or verification fails, report the failure and intended path without
a `PLAN:` handoff.

End the planning request after this response.
