---
name: issue-planner
description: Upgrade rough ideas, feature concepts, or implementation sketches into a Multica issue that is ready to break down and implement. Use in chat whenever the user wants to plan, refine, stress-test, scope, or prepare work as an issue. Interviews one question at a time, then creates the issue with the full plan as its description.
---

# Issue Planner

Turn a rough idea into a settled plan through a chat interview, then create
one Multica issue whose description carries the plan. This skill runs in chat
conversations; it never edits repository files and never implements.

## Workflow

1. Check project context first.
   - If the conversation names a repository, files, or docs, read the relevant
     parts before asking anything.
   - If a question can be answered by reading code, read the code instead of
     asking.
   - Skip exploration only for product-only or purely conceptual prompts.

2. Map the decision tree.
   - Identify the major branches: scope, architecture, sequencing, success
     criteria, tradeoffs accepted.
   - Start with the decision that most affects everything downstream.

3. Interview one question at a time.
   - Ask exactly one question per chat message. Wait for the answer before
     continuing.
   - Every question must include your recommended answer with brief rationale.
   - Prefer multiple choice when 2-3 viable approaches have distinct
     tradeoffs.
   - Never batch questions, even when they feel related.
   - Cover every major branch — scope, edges, failure modes, success criteria,
     dependencies, sequencing, tradeoffs accepted.

4. Walk the tree depth-first.
   - Resolve dependencies between decisions before moving to siblings.
   - Build on settled answers. Only revisit a decision when new information
     changes the tradeoff.
   - Surface assumptions as questions instead of assuming silently.
   - When an answer opens a new branch, walk down it before returning to the
     parent.

5. Apply YAGNI throughout.
   - Cut scope that does not serve the stated goal.
   - Push back on requirements that look like premature generalization.

6. Confirm the issue framing.
   - When every major branch is resolved (or the user signals enough), ask one
     final confirmation question covering: the proposed issue title, priority,
     and project (list options from `multica project list` only when projects
     exist; otherwise file without a project).

7. Create the issue.
   - Build the description from the plan format below.
   - Create it with the CLI, piping the description to preserve formatting:

     ```sh
     multica issue create \
       --title "<title>" \
       --description-stdin \
       [--priority <priority>] [--project <project-id>] \
       --output json <<'DESCRIPTION'
     <plan sections>
     DESCRIPTION
     ```

   - Do not assign the issue, change its status, or create sub-issues.

8. Report the result in chat: the issue identifier (for example `ABC-12`),
   its title, and any open questions the plan still carries. Recommend the
   `issue-breakdown` skill as the next step when the plan is large enough to
   need a task list.

## Plan Format (issue description)

Use these sections in this order, omitting a section only when it is clearly
irrelevant:

1. `## Goal` — the concise outcome the work should achieve.
2. `## Non-goals` — scope intentionally excluded to prevent creep.
3. `## Assumptions` — facts assumed because they were not explicitly settled.
4. `## Settled Decisions` — for each major decision: the question, your
   recommendation, the user's actual answer, and the tradeoff accepted.
5. `## Proposed Approach` — the recommended design and why it fits the goal.
6. `## Implementation Plan` — ordered steps an agent or developer can execute
   without inventing major requirements.
7. `## Validation` — tests, review steps, acceptance checks, or metrics.
8. `## Risks and Mitigations` — the main failure modes and how to reduce them.
9. `## Handoff Notes` — context that helps a future agent continue.
10. `## Open Questions` — only questions that still affect scope,
    architecture, sequencing, risk, or cost.

Do not include a `## Tasks` section; that belongs to the `issue-breakdown`
skill.

## Boundaries

- One issue per planning conversation unless the user explicitly asks to split
  the work into several issues.
- Never edit repository files, commit, or implement anything.
- Never modify an existing issue's description with this skill; re-planning an
  existing issue means updating it only after the user confirms the rewrite.
