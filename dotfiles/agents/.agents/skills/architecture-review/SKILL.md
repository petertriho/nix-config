---
name: architecture-review
description: Use for architecture review, refactoring-opportunity scans, ownership-opportunity discovery, codebase simplification audits, and testability or navigability reviews. Trigger when the user asks to review architecture, improve a codebase, clarify behavior ownership, simplify boundaries, reduce coupling, find shallow modules, identify refactors, discover contract/resource/test seams, or prepare evidence-backed recommendations another engineer or agent can explore; avoid ordinary bug-only reviews unless architecture is the stated focus.
---

# Architecture Review

Surface codebase improvement opportunities as brief, standalone recommendations. Architecture review is about how knowledge and behavior are distributed: what callers must know, what modules own, what tests can prove, and how easily a future engineer or agent can find the right place to change behavior.

Produce a review artifact, not a patch. Do not implement changes, create docs, or produce a full implementation plan unless the user explicitly asks. The useful output is a small set of evidence-backed recommendations another engineer or agent can independently explore.

## References

Read these bundled files as needed:

- `references/exploration.md`: how to inspect the codebase and recognize strong candidates.
- `references/output-format.md`: the required output shape and handoff prompt format.

## Process

1. Frame the review.
   - Establish whether the scope is the whole repository, current diff, named files, or a specific subsystem.
   - If scope is unclear, inspect top-level docs, package/config files, and the current diff before asking. Ask only when the repository is too broad to sample responsibly.
   - If the prompt is an ordinary bug/security/style review with no architecture angle, do not force this skill's output format.

2. Build context before judging.
   - Read enough project context to understand intent: README files, architecture notes, decision records, domain glossaries such as `CONTEXT.md`, package/config files, tests, and relevant call sites.
   - Treat domain docs as naming sources for good ownership seams, and decision records as constraints that should not be re-litigated unless the code shows real friction.
   - Use broad search or an exploration subagent when available for large codebases, such as opencode's `explore` subagent or Claude Code's `Agent` tool with `subagent_type=Explore`, but verify final claims yourself with direct file evidence.
   - Stay self-contained; do not assume a specific context-file convention or require any companion skill.

3. Trace representative behavior.
   - Start from entry points such as commands, routes, public functions, package exports, scheduled jobs, or UI flows.
   - Follow one or two important behaviors end to end before recommending a new interface or boundary.
   - Read nearby tests to see whether behavior is easy to verify through public interfaces or only through internals and mocks.

4. Follow maintenance cost.
   - Look for scattered validation, serialization, error mapping, authorization, retries, caching, logging, state transitions, or provider-specific rules.
   - Notice shallow wrappers: modules that add names but still make callers understand most implementation details.
   - Ask what callers and tests must know today that a clearer behavior owner could hide from them. Treat the interface as every fact a caller must know: names, DTOs, invariants, ordering, configuration, error modes, lifecycle rules, and provider quirks.
   - Look for repeated stable names, DTO mappings, registries, runtime registration, fake contexts, or tests that patch private import paths. These often reveal a missing contract module or test seam.
   - Look for domain branching axes repeated across workflows, activities, DTOs, and tests. A mode, status, artifact, partition type, or resource lifecycle may be the real owner even when no file has that name yet.
   - Apply the deletion test: if deleting a module makes complexity disappear, it may not be useful; if deleting it spreads complexity across callers, it is probably earning its keep.

5. Do a candidate-discovery pass before narrowing.
   - List plausible ownership candidates, including weaker ones, before choosing the final recommendations. This prevents the review from stopping at the first correctness issue and missing broader change-locality or caller-burden opportunities.
   - For each candidate, sketch the current ownership shape and the proposed ownership shape in one or two lines. If the `After` shape cannot be described clearly, mark it as a design-spike candidate or drop it.
   - Do not discard a candidate only because current tests catch drift. Ask whether those tests are revealing production knowledge that should live behind a real interface.

6. Filter candidates.
   - Recommend only when there is concrete evidence, a plausible migration path, and validation that can prove the refactor safe.
   - Prefer deletion, inlining, or moving behavior to an existing owner when that solves the maintenance cost better than adding a new abstraction.
   - Do not recommend broad rewrites from file layout alone. Tie structure to behavior, testability, change safety, or navigation payoff.

7. Produce brief recommendations, not a full implementation plan, unless the user explicitly asks for planning or code changes.

## Recommendation Standard

A good recommendation is independently usable. It includes:

- Exact files and line references showing the current shape.
- The observed maintenance cost and why it matters.
- A concise `Before` and `After` shape that shows what knowledge moves behind which interface.
- The architectural direction, without pretending every interface detail is settled.
- Expected benefits for change safety, reduced repetition, testability, and navigability.
- Validation steps that would prove the refactor is safe.
- Risks, counter-evidence, or constraints that a follow-up planner must consider.
- A self-contained handoff prompt another engineer or agent can use to continue exploration.

The recommendation must make sense without reading this skill or its reference files. Prefer project-specific plain language over architecture jargon. If a specialized term is useful, explain it in the recommendation itself.

Prefer three useful recommendations over ten vague ones, but do not force a hard cap when the evidence supports several distinct ownership problems. Label each as `Ready to plan`, `Needs design spike`, or `Weak signal`:

- `Ready to plan`: multiple pieces of code evidence, clear payoff, and a direction specific enough to hand to a planner.
- `Needs design spike`: there is real maintenance cost, but the right interface, ownership boundary, or migration path needs more investigation.
- `Weak signal`: a suspicious pattern with thin evidence. Use sparingly and explain what would confirm or disprove it.

Before finalizing, check that every recommendation answers four questions: what is hard today, where the evidence is, what should own the behavior instead, and how a follow-up could validate the change.

Use ownership language in the final recommendation. If terms such as interface, seam, adapter, or change locality help, define them in project-specific plain language instead of assuming the reader knows the vocabulary.

## Output

Use the format in `references/output-format.md`.

Return:

- A short orientation paragraph naming the reviewed scope.
- 2-6 brief recommendations ordered by expected payoff.
- Optional `Secondary observations` for real but lower-payoff signals that support or contextualize the main recommendations.
- `Top pick`: the first recommendation to explore and why.
- `Not recommended`: tempting refactors considered and rejected, or `None identified` with a reason.
- `Scope limits`: important areas not inspected.

If there are no worthwhile recommendations, say so directly and explain what evidence led to that conclusion.

## Discipline

- Cite code, not vibes.
- Read project context when it would improve the review, but do not assume a specific docs layout or companion skill.
- Make every recommendation self-contained; do not assume the reader knows this skill's vocabulary.
- Separate evidence from inference. It is fine to say what the code suggests, but label uncertainty clearly.
- Let tests inform architecture. Fragile fakes, import-path patching, and registry completeness tests are often evidence of the current seam shape, not just test cleanup chores.
- Do not create or update docs unless the user asks.
- Do not implement changes during the recommendation pass unless the user explicitly asks.
- Avoid broad rewrites unless tied to concrete behavior, testability, or navigation payoff.
- Avoid architecture theater: a new abstraction is only useful when it reduces caller knowledge, concentrates behavior that changes together, or creates a real test seam.
