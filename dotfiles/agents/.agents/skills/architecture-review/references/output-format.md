# Output Format

Recommendations should be concise enough to skim and complete enough for another engineer or agent to continue independently. They must not require the reader to know this skill's vocabulary or read any bundled reference file.

Open with a short orientation paragraph that names the reviewed scope, how much of it was inspected, and whether the recommendations are based on a whole-repo pass, a sampled subsystem pass, or a current-diff pass.

## Recommendation Template

Use this template for each recommendation:

````markdown
## 1. [Action-Oriented Title]

**Label:** Ready to plan | Needs design spike | Weak signal
**Severity:** Must-have | Should-have | Nice-to-have
**Complexity:** Low | Medium | High

**Files:**
- `path/to/file.ext:line` - what this location demonstrates

**Current shape:**
[What the code does today. Explain any architecture terms in plain language. Name the caller obligations, ordering rules, duplicated knowledge, or ownership boundaries that matter.]

**Before:**
[A concise text diagram or prose shape showing the current ownership/call flow. Emphasize what callers or tests must know.]

**After:**
[A concise text diagram or prose shape showing the proposed owner and what knowledge moves behind its interface. If the shape is uncertain, say what must be spiked.]

**Maintenance cost:**
[Why this shape is costly: duplicated knowledge, behavior spread across too many files, fragile tests, confusing navigation, or hard-to-change behavior.]

**Recommendation:**
[The architectural direction. Name the behavior or concept that should own more responsibility. Avoid pretending the final interface is fully designed unless the code makes it obvious.]

**Cut / replacement (simplification only):**
[For simplification-focused recommendations only: name what to delete, inline, or replace with standard-library/platform-native behavior. If nothing replaces it, say "Nothing replaces this." Omit this field when it would not apply.]

**Why this helps:**
[Explain the concrete benefits for change safety, testing, and engineer/agent navigability. Define any specialized term you use.]

**Validation:**
- [Tests, checks, or behavior that should prove the refactor is safe]

**Risks:**
- [Compatibility, migration, deployment, counter-evidence, or uncertainty concerns]

**Handoff prompt:**
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
Investigate whether an OrderIntake owner can take over order validation.
Start with src/orders/create.ts, src/orders/validate.ts, and tests/orders/create.test.ts.
Observed maintenance cost: three callers repeat the validation order and the error mapping before they call createOrder.
Explore whether one interface can own validation, persistence preparation, and error normalization. Keep the current create-order behavior.
Return a short plan with the proposed interface, migration steps, tests to add, and compatibility risks.
To validate the change, move the caller-level validation tests to the interface of the new module. The existing API behavior must not change.
Do not implement the change until the user approves the interface and the migration path.
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

Omit `Secondary Observations` if it would only pad the report. If there are no credible rejected refactors, write `None identified` and explain why. If there are no worthwhile recommendations at all, skip the numbered recommendations and `Top Pick`, explain the evidence that led to that conclusion, and still include `Not Recommended` and `Scope Limits`.

## Style

- Keep each recommendation focused on one improvement.
- Prefer concrete file evidence over abstract architecture language.
- Use plain language first. If jargon helps, define it where it appears.
- Include a short `Before` and `After` shape for every recommendation. Use text diagrams when they clarify ownership; use prose when the change is simple.
- For simplification findings that do not need a full recommendation, put them in `Secondary Observations` as concise `cut -> replacement` notes with file references.
- Do not add a global net-line score unless the user requested a terse complexity-only review.
- Do not include implementation diffs unless the user explicitly asks for code changes.
- Do not pad the report. Fewer strong recommendations are better than a catalog of weak possibilities.

## Readability Pass

Process step 10 revises the saved review with the `asd-ste100` and `write-better` skills when they are available. The review contract takes priority over any writing rule.

Keep these exact:

- The headings, field names, and field order of this template, even where a writing skill prefers sentence case.
- The `Label`, `Severity`, and `Complexity` values.
- File paths, `path:line` references, identifiers, commands, quoted code or errors, and the text diagrams in `Before` and `After`.
- Every required field, fact, risk, counter-evidence item, and scope limit. Remove repetition inside and across fields, but do not remove a required field.

Keep uncertainty accurate:

- Keep the words that separate evidence from inference. Do not turn "the code suggests" into a statement of fact, and do not make a `Weak signal` sound certain.
- STE replaces "may", "might", and "could" with "can". Use "can" only for a possibility or a capability. For a guess about the current code, give the evidence and a qualifier such as "probably" or "the evidence suggests".
- Write a recommendation as a direct statement of the proposed direction instead of "should". Use "must" only when the code, a decision record, or the user makes it a requirement.

If neither writing skill is available, apply these fallback rules:

1. Put the main point first in each field.
2. Keep descriptive sentences to 25 words or fewer. Keep `Validation` steps and handoff prompt sentences to 20 words or fewer. Inline code counts as one word.
3. Write one instruction per sentence. Put a condition before its instruction.
4. Use one term for each concept in the whole review.
5. Use active voice and simple tenses when the actor is known.
6. Delete filler, promotional words, and slogans. State the consequence with facts.
7. Do not use semicolons, em dashes, or contractions in prose.

Fallback check: count the words in the three longest sentences. Search the prose for `;`, `—`, `should`, `has been`, and contractions. Fix each hit with the rules in this section.
