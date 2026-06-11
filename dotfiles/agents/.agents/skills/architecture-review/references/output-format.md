# Output Format

Recommendations should be concise enough to skim and complete enough for another engineer or agent to continue independently. They must not require the reader to know this skill's vocabulary or read any bundled reference file.

Open with a short orientation paragraph that names the reviewed scope, how much of it was inspected, and whether the recommendations are based on a whole-repo pass, a sampled subsystem pass, or a current-diff pass.

## Recommendation Template

Use this template for each recommendation:

````markdown
## 1. [Action-Oriented Title]

Label: Ready to plan | Needs design spike | Weak signal

Files:
- `path/to/file.ext:line` - what this location demonstrates

Current shape:
[What the code does today. Explain any architecture terms in plain language. Name the caller obligations, ordering rules, duplicated knowledge, or ownership boundaries that matter.]

Before:
[A concise text diagram or prose shape showing the current ownership/call flow. Emphasize what callers or tests must know.]

After:
[A concise text diagram or prose shape showing the proposed owner and what knowledge moves behind its interface. If the shape is uncertain, say what must be spiked.]

Maintenance cost:
[Why this shape is costly: duplicated knowledge, behavior spread across too many files, fragile tests, confusing navigation, or hard-to-change behavior.]

Recommendation:
[The architectural direction. Name the behavior or concept that should own more responsibility. Avoid pretending the final interface is fully designed unless the code makes it obvious.]

Why this helps:
[Explain the concrete benefits for change safety, testing, and engineer/agent navigability. Define any specialized term you use.]

Validation:
- [Tests, checks, or behavior that should prove the refactor is safe]

Risks:
- [Compatibility, migration, deployment, counter-evidence, or uncertainty concerns]

Handoff prompt:
```text
[Self-contained prompt for another engineer or agent]
```
````

## Handoff Prompt Requirements

Each handoff prompt must include:

- Objective.
- Starting files and why they matter.
- Observed maintenance cost.
- The current ownership shape and proposed ownership shape.
- Any architecture terms or assumptions needed to understand the recommendation.
- Constraints or compatibility concerns.
- Expected output from the follow-up engineer or agent.
- Validation criteria.
- A reminder not to implement until the interface or migration path has been confirmed, unless the user asked for implementation.

Example:

```text
Investigate whether order validation should move behind an OrderIntake owner.
Start with src/orders/create.ts, src/orders/validate.ts, and tests/orders/create.test.ts.
Observed maintenance cost: three callers duplicate validation ordering and error mapping before calling createOrder.
Explore whether one interface can own validation, persistence preparation, and error normalization while preserving current create-order behavior.
Return a short plan with proposed interface, migration steps, tests to add, and compatibility risks.
Validate by moving caller-level validation tests to the new module interface and preserving existing API behavior.
```

## Final Sections

After the recommendations, include:

```markdown
## Top Pick
[The recommendation to explore first and why.]

## Secondary Observations
- [Optional: lower-payoff signals, supporting observations, or candidates that are real but not first moves]

## Not Recommended
- [Tempting refactor] - [why not]

## Scope Limits
- [Area not inspected or evidence not gathered]
```

Omit `Secondary Observations` if it would only pad the report. If there are no credible rejected refactors, write `None identified` and explain why. If there are no worthwhile recommendations at all, skip the numbered recommendations and explain the evidence that led to that conclusion, then still include `Scope Limits`.

## Style

- Keep each recommendation focused on one improvement.
- Prefer concrete file evidence over abstract architecture language.
- Use plain language first. If jargon helps, define it where it appears.
- Include a short `Before` and `After` shape for every recommendation. Use text diagrams when they clarify ownership; use prose when the change is simple.
- Do not include implementation diffs unless the user explicitly asks for code changes.
- Do not pad the report. Fewer strong recommendations are better than a catalog of weak possibilities.
