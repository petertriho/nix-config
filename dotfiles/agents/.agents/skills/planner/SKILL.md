---
name: planner
description: Upgrade rough ideas, partial plans, feature concepts, product brainstorms, or implementation sketches into plans that are ready to execute or convert into formal specs. Use whenever the user wants to refine, stress-test, scope, harden, sequence, clarify, or prepare work for implementation, PRDs, spec-driven development, or agent/developer handoff.
---

## Rules

Apply these rules only to the current planning request. Respect the host's
permissions and higher-priority instructions.

- This skill is an interactive interview, not a one-shot answer. Do not
  output a plan, an implementation plan, or a list of steps until the
  interview is finished (step 6).
- Ask each question with the host's question tool. In Claude Code, call
  `AskUserQuestion` with 2-3 options and your recommended option first. If no
  question tool exists, ask in plain text and end the turn.
- Do not use the host's built-in planning flow. In Claude Code, never call
  `EnterPlanMode` or `ExitPlanMode`. This skill owns the interview and the
  file write in step 7. Use the preflight below if native plan mode is
  already active.
- The plan is a file, not only chat text. Save new plans to
  `.artifacts/<plan-name>/PLAN.md` in step 7. For an explicit revision,
  update the identified plan file.
- Do not implement the plan or commit changes during this request.

## Preflight

Check the host's visible mode and permission state before starting the
interview. If native plan mode is active, ask the user to switch to normal
mode before proceeding. This workflow writes an artifact outside the host's
native plan file.

Treat permission denials and blocked writes as blockers. Do not bypass
restrictions. If saving fails, preserve the interview answers for a retry
after the user resolves the blocker.

## Workflow

1. Check project context first.
   - Read the relevant parts of the codebase, recent commits, named files,
     and any docs the user pointed at before asking planning questions.
   - For a revision, read the identified plan and any existing sibling
     `TASKS.md` before interviewing.
   - For revisions, keep existing decisions settled unless the user or new
     evidence changes them.
   - For large codebases, use broad search or an exploration subagent, such as
     opencode's `explore` or Claude Code's `Agent` with
     `subagent_type=Explore`, to find where related code lives and how similar
     work is already structured; verify final claims with direct file evidence.
   - If a question can be answered by reading the code, read the code
     instead of asking.
   - Skip exploration only for product-only or purely conceptual prompts.

2. Map the decision tree.
   - Identify the major branches: scope, architecture, sequencing, success
     criteria, tradeoffs accepted.
   - Start with the decision that most affects everything downstream.

3. Interview one question at a time.
   - Ask exactly one question per turn. Wait for the answer before
     continuing.
   - Every question must include your recommended answer with brief
     rationale.
   - Prefer multiple choice when 2-3 viable approaches have distinct
     tradeoffs.
   - Never batch questions, even when they feel related.
   - Cover every major branch — scope, edges, failure modes, success
     criteria, dependencies, sequencing, tradeoffs accepted.

4. Walk the tree depth-first.
   - Resolve dependencies between decisions before moving to siblings.
   - Build on settled answers. Only revisit a decision when new information
     changes the tradeoff.
   - Surface assumptions as questions instead of assuming silently.
   - When an answer opens a new branch, walk down it before returning to
     the parent.

5. Apply YAGNI throughout.
   - Cut scope that does not serve the stated goal.
   - Push back on requirements that look like premature generalization.

6. End the interview and assess readiness.
   - Stop when every major branch is resolved or the user signals enough.
   - Do not ask more interview questions after the user stops.
   - Mark the plan `Ready` only when major decisions are settled and no
     unresolved question blocks implementation.
   - Mark the plan `Draft` when the interview ends early or a blocking
     decision remains.
   - For drafts, identify which implementation steps are blocked by each
     unresolved decision.
   - Treat unapproved recommendations as proposed defaults, not user-approved
     decisions. A request to stop is not approval of unanswered recommendations.

7. Save a new plan or revise an existing plan.
   - Resolve `.artifacts/` from the current project root, or the working
     directory when no project root exists.
   - For an explicit revision:
     - Use the identified plan file's existing path.
     - Read its latest contents before editing.
     - Preserve user-authored context and unaffected decisions.
     - In Handoff Notes, identify any existing tasks invalidated by the revision.
   - For a new planning effort:
     - Choose a concise kebab-case `<plan-name>` based on the goal.
     - If that directory already exists, choose an unused suffix such as
       `-2`, `-3`, or a timestamp.
     - Do not infer a revision merely because the goal or directory name matches.
   - Treat every other plan and artifact, including `TASKS.md`, as read-only.
   - Create the chosen plan directory only if needed.
   - Write the plan using Final Plan Format.
   - Read the saved file to verify its path and contents before reporting success.

## Final Plan Format

Use this format for both `Ready` and `Draft` plans. Start the file with a
title and `Status: Ready` or `Status: Draft`. For drafts, summarize why the
plan is not ready immediately below the status.

Use these sections in order, unless a section is clearly irrelevant:

1. Goal
   - The concise outcome the work should achieve.

2. Non-goals
   - Scope intentionally excluded to prevent plan creep.

3. Assumptions
   - Any facts assumed because they were not explicitly settled.
   - Label proposed defaults that the user has not approved.

4. Settled Decisions
   - For interview decisions, record the question, recommendation, user's
     actual answer, and accepted tradeoff.
   - For decisions supplied in the brief or an existing plan, cite that
     source instead of inventing interview history.
   - Keep unanswered recommendations out of this section.

5. Proposed Approach
   - The recommended design or product approach and why it fits the goal.

6. Implementation Plan
   - For `Ready` plans, provide ordered steps that can be executed without
     inventing major requirements.
   - For `Draft` plans, outline the known steps without inventing unresolved
     requirements.
   - Mark blocked steps with references to the blocking open questions.

7. Validation
   - Tests, review steps, acceptance checks, or success metrics.

8. Risks and Mitigations
   - The main ways the plan could fail and how to reduce that risk.

9. Handoff Notes
   - Context that would help a future agent, developer, or spec writer
     continue.

10. Open Questions
    - Only questions that still affect scope, architecture, sequencing,
      risk, or implementation cost.
    - Separate blocking questions from nonblocking questions.
    - For each blocker, name the affected steps and the decision needed to
      unblock them.

## Final Response

After verifying the saved plan, report:

- The exact path on its own line as `PLAN: <absolute path>`.
- `Status: Ready` or `Status: Draft`.
- A short summary of settled decisions.
- Remaining blockers, or `Blockers: None` when there are none.
- Any existing `TASKS.md` that needs review after a revision.

If saving or verification fails, report the failure and intended path instead
of a successful `PLAN:` handoff.

End this planning request after the handoff. Do not start implementation.
