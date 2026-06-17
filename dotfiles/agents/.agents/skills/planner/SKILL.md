---
name: planner
description: Upgrade rough ideas, partial plans, feature concepts, product brainstorms, or implementation sketches into plans that are ready to execute or convert into formal specs. Use whenever the user wants to refine, stress-test, scope, harden, sequence, clarify, or prepare work for implementation, PRDs, spec-driven development, or agent/developer handoff.
---

## Workflow

1. Check project context first.
   - Read the relevant parts of the codebase, recent commits, named files,
     and any docs the user pointed at before asking anything.
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

6. Stop the interview when every major branch has been resolved, or the
   user signals enough. Then output the plan.

7. Save the plan.
   - Choose a concise kebab-case `<plan-name>` based on the goal.
   - Write the final plan to `.artifacts/<plan-name>/PLAN.md`.
   - Create `.artifacts/<plan-name>/` if it does not already exist.

## Final Plan Format

Once the interview reaches shared understanding, output the upgraded plan
using these sections in this order, unless a section is clearly irrelevant:

1. Goal
   - The concise outcome the work should achieve.

2. Non-goals
   - Scope intentionally excluded to prevent plan creep.

3. Assumptions
   - Any facts assumed because they were not explicitly settled.

4. Settled Decisions
   - For each major decision: the question asked, your recommended answer,
     the user's actual answer, and the tradeoff accepted.

5. Proposed Approach
   - The recommended design or product approach and why it fits the goal.

6. Implementation Plan
   - Ordered steps that an agent or developer can execute without inventing
     major requirements.

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

## Stop

Stop the interview when every major branch has been resolved or the user
signals enough.
