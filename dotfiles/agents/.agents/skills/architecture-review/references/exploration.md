# Exploration Guide

Explore organically, but gather enough evidence that each recommendation can stand alone.

## First Pass

1. Identify the review frame: whole repository, current diff, named files, or subsystem.
2. Read context that explains intent: README files, package/config files, architecture notes, decision records, domain glossaries, and test conventions.
3. Identify entry points: commands, routes, public functions, scheduled jobs, UI flows, package exports, plugin hooks, or background workers.
4. Trace one or two representative behaviors end to end.
5. Read nearby tests to see what behavior is easy or hard to verify.
6. Scan call sites to learn what callers must know before using each module.
7. Note where names, file boundaries, and ownership help or hinder navigation.

For large codebases, sample deliberately. Follow the areas with the strongest change pressure or clearest caller burden, and record the uninspected areas in `Scope limits`.

## Maintenance Cost Signals

Look for these patterns:

- Behavior scattered across many callers before or after a central function is called.
- Repeated validation, serialization, error mapping, authorization, retry, caching, logging, or state-transition logic.
- Modules that mostly delegate but still require callers to understand internal details.
- Public interfaces that expose ordering rules, implicit invariants, provider quirks, or setup/teardown obligations every caller must remember.
- Tests that exercise helpers but miss the user-visible behavior that combines them.
- Tests that need private state, exact ordering, or mocks for every internal step.
- Feature behavior split by technical layer when it usually changes as one concept.
- An integration point with only one production implementation and no meaningful test substitute.
- A directory or naming scheme that makes the next change hard to locate.
- A current diff that repeats a pattern in several places because no owner exists for the concept being changed.

## Candidate Tests

Use these questions to separate real architecture recommendations from style preferences:

- **Caller burden**: What does each caller need to know that the callee could own?
- **Deletion test**: If this module disappeared, would complexity disappear or reappear across callers?
- **Change locality**: When this behavior changes, how many files must move together?
- **Test surface**: Can important behavior be tested through a stable public interface, or only by mocking internals?
- **Name fit**: Is there a domain concept in the code or docs that naturally owns the behavior?
- **Migration path**: Can the change be staged without rewriting the subsystem at once?

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
Pure computation or in-memory state. Usually safe to deepen directly and test through the new interface.

**Local-substitutable**
Dependencies with local stand-ins, such as filesystems, clocks, queues, databases with local containers, or in-memory stores. Prefer testing behavior through the deepened module with the stand-in behind it.

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
