---
name: plan-upgrade
description: Upgrade rough ideas, partial plans, feature concepts, product brainstorms, or implementation sketches into plans that are ready to execute or convert into formal specs. Use whenever the user wants to refine, stress-test, scope, harden, sequence, clarify, or prepare work for implementation, PRDs, spec-driven development, or agent/developer handoff.
---

## Workflow

1. Identify the planning mode:
   - If the user provided enough context to proceed, produce the upgraded plan
     directly and call out assumptions.
   - If a major requirement, scope boundary, architectural choice, sequencing
     constraint, or success criterion is missing, run the decision loop.
   - If the idea is too large for one coherent plan, decompose it before
     refining details.

2. Build shared understanding of what should be built, why, what is out of
   scope, and which tradeoffs are accepted.

3. Check project context only when the plan depends on an existing codebase,
   named files, framework conventions, docs, or recent changes. Prefer
   user-provided context first. Do not do broad repository exploration for
   product-only or conceptual planning prompts.

4. Apply YAGNI: cut scope that does not serve the stated goal.

## Decision Loop

Run this loop only when a blocking decision remains. Surface the decision that most
affects scope, architecture, sequencing, risk, or implementation cost.

- Ask at most one blocking question per turn.
- Prefer multiple choice when useful.
- Include 2-3 viable approaches with tradeoffs when there are multiple paths.
- Include your recommended answer and a brief rationale.
- Wait for the user before continuing when the answer would materially change
  the plan.
- If a detail is not blocking, state a reasonable assumption and continue.

Build on settled answers. Only revisit a decision when new information changes
the tradeoff.

## Final Plan Format

When enough context exists, output an implementation-ready plan. Use these
sections in this order unless a section is clearly irrelevant:

1. Goal
   - The concise outcome the work should achieve.

2. Non-goals
   - Scope intentionally excluded to prevent plan creep.

3. Assumptions
   - Any facts assumed because they were not explicitly settled.

4. Settled Decisions
   - Important choices already made, including tradeoffs accepted.

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
   - Context that would help a future agent, developer, or spec writer continue.

10. Open Questions
   - Only questions that still affect scope, architecture, sequencing, risk, or
     implementation cost.

## Stop

Stop when the plan can be implemented or turned into a formal spec without
inventing major requirements, scope, or architecture.

Do not chase minor details once the major decisions are settled.
