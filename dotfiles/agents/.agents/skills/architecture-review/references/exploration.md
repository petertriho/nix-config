# Exploration Guide

Explore organically, but gather enough evidence that each recommendation can stand alone.

## First Pass

1. Identify the review frame: whole repository, current diff, named files, or subsystem.
2. Read context that explains intent: README files, package/config files, architecture notes, decision records, domain glossaries, and test conventions.
   - Prefer project vocabulary when naming candidates. Domain terms often identify better ownership seams than file or class names.
   - Treat decision records as constraints. Only recommend revisiting one when concrete friction justifies the cost.
3. Identify entry points: commands, routes, public functions, scheduled jobs, UI flows, package exports, plugin hooks, or background workers.
4. Trace one or two representative behaviors end to end.
5. Read nearby tests to see what behavior is easy or hard to verify.
6. Scan call sites to learn what callers must know before using each module.
7. Note where names, file boundaries, and ownership help or hinder navigation.
8. Sketch a broad candidate list before narrowing. Include candidates that may later become `Not recommended` or `Weak signal` so the review does not anchor on the first issue found.

For large codebases, sample deliberately. Follow the areas with the strongest change pressure or clearest caller burden, and record the uninspected areas in `Scope limits`.

## Maintenance Cost Signals

Look for these patterns:

- Behavior scattered across many callers before or after a central function is called.
- Repeated validation, serialization, error mapping, authorization, retry, caching, logging, or state-transition logic.
- Modules that mostly delegate but still require callers to understand internal details.
- Public interfaces that expose ordering rules, implicit invariants, provider quirks, or setup/teardown obligations every caller must remember.
- Repeated stable names, DTO mappings, registries, fake contexts, runtime registration, or contract-completeness tests that all describe the same operation.
- A domain branching axis, such as mode, status, partition type, provider, artifact type, or lifecycle state, repeated across workflows, activities, DTOs, and tests.
- Resource construction scattered across runtime wiring and behavior modules, especially databases, queues, object storage, clocks, secrets, config, or network clients.
- Tests that exercise helpers but miss the user-visible behavior that combines them.
- Tests that need private state, exact ordering, or mocks for every internal step.
- Tests that patch implementation import paths instead of crossing the same interface production code uses.
- Feature behavior split by technical layer when it usually changes as one concept.
- An integration point with only one production implementation and no meaningful test substitute.
- A directory or naming scheme that makes the next change hard to locate.
- A current diff that repeats a pattern in several places because no owner exists for the concept being changed.

## Candidate Tests

Use these questions to separate real architecture recommendations from style preferences:

- **Caller burden**: What does each caller need to know that the callee could own?
- **Deletion test**: If this module disappeared, would complexity disappear or reappear across callers?
- **Change locality**: When this behavior changes, how many files must move together?
- **Caller knowledge**: Would a clearer owner let callers do more while knowing less?
- **Test surface**: Can important behavior be tested through a stable public interface, or only by mocking internals?
- **Name fit**: Is there a domain concept in the code or docs that naturally owns the behavior?
- **Seam reality**: Are there real adapters, substitutes, external dependencies, or caller variations that justify a seam?
- **Migration path**: Can the change be staged without rewriting the subsystem at once?

## Ownership Patterns

Use these patterns to find ownership candidates that are easy to miss when the review focuses only on correctness bugs:

**Contract module**
Repeated operation names, payload models, output models, DTO registries, fake contexts, runtime registration, and completeness tests may be one implicit interface. Consider a contract module when one concept needs to bind name, input, output, call kind, validation, and test substitution.

**Domain mode owner**
If a domain mode or state branches in several workflows, activities, DTOs, and projections, the current owner may be shallow. Consider whether one module should own what the mode means: planning, artifacts, copy behavior, links, restart behavior, or validation.

**Runtime resources owner**
If behavior modules construct databases, object stores, queues, secrets clients, settings, or clocks directly, tests often patch whichever import path the implementation happens to use. Consider one runtime resource interface with production and test adapters when it would concentrate lifecycle and make tests cross the same seam as production.

**Output pipeline owner**
If a module mixes query shape, path mapping, encoding, counters, and object output, ask whether the output concept should own the whole pipeline. Avoid a generic repository unless the domain operation needs one; the owning module should hide related details that change together.

**Leaf executor owner**
If several leaf workflows or handlers repeat the same outcome rules around different adapters, consider a shared executor that owns the common outcome semantics while preserving small adapters for real differences.

**Test seam owner**
Treat fragile tests as evidence. A fake context, import-path patching, or registry drift test can mean the production seam is implicit. The recommendation should explain whether to move behavior behind a clearer production owner, simplify tests, or leave the seam as-is.

## Counter-Signals

Do not recommend a refactor just because one of these is true:

- A file is long, but behavior is cohesive and tests cover it well.
- A helper is small, but it removes repeated caller knowledge or isolates a volatile dependency.
- There is only one implementation of an interface, but the interface hides a real external dependency, test substitute, or protocol boundary.
- Names or folders look inconsistent, but no behavior is hard to change or verify.
- A possible abstraction would make the model cleaner but add migration risk without near-term payoff.

## Dependency Shapes

Use the dependency shape to keep recommendations realistic:

**In-process**
Pure computation or in-memory state. Usually safe to move behind a clearer owner and test through the new interface.

**Local-substitutable**
Dependencies with local stand-ins, such as filesystems, clocks, queues, databases with local containers, or in-memory stores. Prefer testing behavior through the owning module with the stand-in behind it.

**Remote but owned**
Internal network services. Consider a narrow port only when the business behavior should remain local while transport varies between production and tests.

**External**
Third-party services. Keep the integration point narrow, normalize errors near the edge, and test with fakes or mocks that reflect expected provider behavior.

If the dependency shape does not justify a seam, say so in `Not recommended` rather than inventing one.

## Recommendation Labels

**Ready to plan**
Concrete evidence from multiple files or call sites, clear testability or change-safety payoff, and a direction specific enough to hand to a planner.

**Needs design spike**
There is real maintenance cost, but the right interface, ownership boundary, or migration path needs more investigation.

**Weak signal**
The pattern looks suspicious but evidence is thin. Use this sparingly and explain what would confirm or disprove it.

## Exploration Boundaries

- Read project docs, decision records, and configuration when they clarify intent or constraints, but do not assume they exist or follow a specific layout.
- Do not recommend broad rewrites from file layout alone. Tie structure to behavior and change pressure.
- Do not force every issue into an abstraction. Sometimes deletion or inlining is the right improvement.
- Do not hide uncertainty. Mark incomplete evidence in `Scope limits` or the recommendation's `Risks` section.
- If a user asked for current-diff review, distinguish architecture issues introduced by the diff from pre-existing maintenance cost nearby.
