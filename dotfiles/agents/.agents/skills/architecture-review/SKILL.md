---
name: architecture-review
description: Use for architecture review, refactoring-opportunity scans, ownership-opportunity discovery, codebase simplification audits, over-engineering/deletion reviews with an architecture angle, and testability or navigability reviews. Trigger when the user asks to review architecture, improve a codebase, clarify behavior ownership, simplify boundaries, reduce coupling, find shallow modules, identify refactors, discover contract/resource/test seams, identify what can be deleted, or prepare evidence-backed recommendations another engineer or agent can explore; avoid ordinary bug-only reviews unless architecture is the stated focus.
disable-model-invocation: true
---

# Architecture Review

Surface codebase improvement opportunities as brief, standalone recommendations. Architecture review is about how knowledge and behavior are distributed: what callers must know, what modules own, what tests can prove, and how easily a future engineer or agent can find the right place to change behavior. Simpler architecture is often smaller architecture, so use a deletion-first lens before proposing new boundaries.

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
   - Stay self-contained; do not assume a specific context-file convention or require any companion skill. Step 10 uses writing skills when they are available and has a fallback when they are not.

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
   - Run an over-engineering pass before adding any abstraction: look for dead flexibility, unused configuration, one-implementation interfaces, layers with one caller, hand-rolled standard-library behavior, dependencies that duplicate platform-native features, and code that can express the same behavior in fewer moving parts.
   - Apply the deletion test: if deleting a module makes complexity disappear, it may not be useful; if deleting it spreads complexity across callers, it is probably earning its keep.

5. Apply the simplification lens without changing the review contract.
   - Treat terse simplification findings as an additive lens, not a replacement output format. Do not switch to one-line complexity-only review or add a global `net: -N lines` score unless the user explicitly asks for that style.
   - When a candidate is primarily about excess complexity, classify the shape internally as `delete`, `stdlib`, `native`, `yagni`, or `shrink`: remove unused code, use a standard-library function, use a platform-native feature, defer speculative flexibility, or express the same logic more directly.
   - For each simplification candidate, name what to cut and what replaces it. If nothing should replace it, say so directly.
   - Do not flag a small smoke test, assert-based self-check, clear adapter for a real external boundary, or narrow interface with a meaningful test substitute as bloat just because it adds lines.

6. Do a candidate-discovery pass before narrowing.
   - List plausible ownership candidates, including weaker ones, before choosing the final recommendations. This prevents the review from stopping at the first correctness issue and missing broader change-locality or caller-burden opportunities.
   - For each candidate, sketch the current ownership shape and the proposed ownership shape in one or two lines. If the `After` shape cannot be described clearly, mark it as a design-spike candidate or drop it.
   - Do not discard a candidate only because current tests catch drift. Ask whether those tests are revealing production knowledge that should live behind a real interface.

7. Filter candidates.
   - Recommend only when there is concrete evidence, a plausible migration path, and validation that can prove the refactor safe.
   - Prefer deletion, inlining, or moving behavior to an existing owner when that solves the maintenance cost better than adding a new abstraction.
   - If a native, standard-library, or inline replacement solves the issue, prefer that over a new project-specific helper or interface.
   - Do not recommend broad rewrites from file layout alone. Tie structure to behavior, testability, change safety, or navigation payoff.

8. Draft the review.
   - Write each recommendation to the Recommendation Standard below, in the format of `references/output-format.md`.
   - Keep recommendations brief. Do not write a full implementation plan unless the user explicitly asks for planning or code changes.

9. Save the review.
   - Choose the save mode before writing. New-review mode is the default; a request to review or rescan the same scope again still creates a new artifact.
   - Use revision mode only when the user explicitly asks to edit, revise, or update an existing review and either provides its exact path or unambiguously refers to a review created earlier in the current conversation. Ask which review to revise if the target is ambiguous.
   - In revision mode, modify only the identified `REVIEW.md` in place. Do not create a timestamped replacement unless the user asks for a new version, and never move or delete the review directory.
   - In new-review mode, choose a concise kebab-case `<review-name>` based on the reviewed scope or focus (for example `auth-boundary` or `import-pipeline`). Generate a save-time timestamp in `YYYYMMDD-HHMMSS` form and write the review to `.artifacts/reviews/<review-name>-<timestamp>/REVIEW.md`.
   - Check that the complete new-review destination directory does not already exist before writing. If it exists, append `-2`, `-3`, and so on until the destination is unused. Create only that new directory.
   - The new destination is the active review for the current invocation and may be edited as needed until the response is finalized.
   - Treat every other existing review as append-only history: never edit, overwrite, move, or delete it.
   - Keep related plans, tasks, and earlier reviews in their existing directories. Refer to them by path inside the new review when useful instead of colocating the new review with them.
   - Skip saving only when the prompt was an ordinary bug/security/style review with no architecture angle, where this skill's output format does not apply.

10. Revise the saved review for readability.
   - If the `asd-ste100` skill is available, load it through the client's skill tool or read its `SKILL.md`. Use its pragmatic mode unless the user asks for strict STE compliance.
   - If the `write-better` skill is available, load it too. Use it for what STE does not cover: main point first, no filler or rhetorical packaging, and honest uncertainty.
   - If neither skill is available, apply the fallback rules under `Readability Pass` in `references/output-format.md`.
   - Treat `Validation` steps and handoff prompts as procedural text. Treat all other prose as descriptive text. A handoff prompt is an instruction for another agent, not code, so revise it too.
   - When a writing rule conflicts with the review contract, keep the contract. `Readability Pass` lists what the pass must not change.
   - Edit only the active review. In revision mode, apply this pass only to the text you added or changed for the request, unless the user asks for a full rewrite.
   - Run the self-checks from the loaded writing skills, or the fallback check, on the saved file. Then re-read the file and confirm that every fact, file reference, label, risk, and uncertainty marker is still present.

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
- For simplification recommendations, a clear cut/replacement statement and, when credible, a rough net-line reduction estimate. Do not make line count the only reason; tie the deletion to reduced caller knowledge, fewer moving parts, or easier change.

The recommendation must make sense without reading this skill or its reference files. Use ownership language and project-specific plain language instead of architecture jargon. If a term such as interface, seam, adapter, or change locality helps, define it in the recommendation itself.

Prefer three useful recommendations over ten vague ones, but do not force a hard cap when the evidence supports several distinct ownership problems. Label each as `Ready to plan`, `Needs design spike`, or `Weak signal`:

- `Ready to plan`: multiple pieces of code evidence, clear payoff, and a direction specific enough to hand to a planner.
- `Needs design spike`: there is real maintenance cost, but the right interface, ownership boundary, or migration path needs more investigation.
- `Weak signal`: a suspicious pattern with thin evidence. Use sparingly and explain what would confirm or disprove it.

Before finalizing, check that every recommendation answers four questions: what is hard today, where the evidence is, what should own the behavior instead, and how a follow-up could validate the change.

## Output

Process steps 8 to 10 draft, save, and revise `REVIEW.md`. `references/output-format.md` is the only source for its section order, headings, and field names. In that order, `REVIEW.md` contains:

- An orientation paragraph that names the reviewed scope, how much of it you inspected, and the type of pass.
- The numbered recommendations, ordered by expected payoff. Most reviews have two to six. Let the evidence set the count, as the Recommendation Standard says.
- `Top Pick`: the recommendation to explore first, and why.
- `Secondary Observations` (optional): real but lower-payoff signals. Write simplification findings here as concise `cut -> replacement` notes instead of full recommendations.
- `Not Recommended`: tempting refactors you considered and rejected, or `None identified` with a reason.
- `Scope Limits`: important areas you did not inspect.

If no recommendation is worthwhile, omit the numbered recommendations and `Top Pick`. Say so directly, explain the evidence for that conclusion, and still include `Not Recommended` and `Scope Limits`.

After the readability pass in Process step 10, give the saved file path, the top pick if there is one, and any scope limits in the final response, so the user can act without reopening the file.

## Discipline

- Cite code, not vibes.
- Preserve review history: only the active new review or explicit revision target is writable. Every other existing file and directory under `.artifacts/reviews/` is a read-only input; do not modify, move, or delete it.
- Separate evidence from inference. It is fine to say what the code suggests, but label uncertainty clearly.
- Let tests inform architecture. Fragile fakes, import-path patching, and registry completeness tests are often evidence of the current seam shape, not just test cleanup chores.
- Do not implement changes or create or update docs unless the user explicitly asks.
- Avoid architecture theater: a new abstraction is only useful when it reduces caller knowledge, concentrates behavior that changes together, or creates a real test seam.
