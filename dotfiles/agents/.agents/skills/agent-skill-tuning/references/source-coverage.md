# Source coverage and preservation map

This map separates retained lessons from generalized advice and excluded runtime-specific details.
It does not claim that every source recommendation remains an instruction.
Source topics use neutral labels rather than model or vendor names.

## Contents

- [Sources and reading evidence](#sources-and-reading-evidence)
- [Skill-authoring source](#skill-authoring-source)
- [Workflow source](#workflow-source)
- [Prompting source](#prompting-source)
- [Existing advice and safeguards](#existing-advice-and-safeguards)
- [Adaptations and exclusions](#adaptations-and-exclusions)
- [Maintenance rule](#maintenance-rule)

## Sources and reading evidence

The previous verification record reports complete primary-source reads on 2026-10-04:

- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Agent workflow guidance](https://claude.dev/blog/getting-the-most-out-of-opus-5-5/)
- [Prompting and runtime guidance](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)

That record includes extracted text, code blocks, live HTML headings, and three authoring diagrams.
It reports no hidden tab or expandable-section advice.
The authoring page's expandable example was a code block.
Workflow-image descriptions repeated the task, stop, delegation, and checklist lessons.

The portability rewrite and subsequent simplification used saved skill files and their source inventory.
Neither fetched the primary pages again.
Historical HTTP and extraction checks do not establish current link availability.
Coverage concerns these three primary sources, not every page they link.

All operational references link directly from `SKILL.md`.
Sections **A01–A24** identify [skill-authoring practices](skill-authoring.md).
Sections **R01–R16** identify [runtime guidance](runtime-guidance.md).
[Prompt principles](prompt-principles.md) contains transferable hypotheses and their limits.

Local evaluation follow-ups in A10, A12, and the final-response rule come from tuning trials, not the primary sources.

Status meanings:

- **Retained:** The lesson remains, with prose edits where useful.
- **Generalized:** Capability checks replace named-model or vendor assumptions.
- **Excluded:** Nontransferable details are absent from operational advice.

## Skill-authoring source

| Source topic | Treatment | Destination |
| --- | --- | --- |
| Introduction and core principles | Retained: concise, structured skills evaluated in real use. | A01, A13–A15, A24 |
| Context economy | Generalized: shared context, useful specificity, and metadata-first loading where supported. Retained: approximate PDF token contrast. | A01 |
| Degrees of freedom | Retained: specificity follows risk and variability, with review, report, migration, and bridge examples. | A02 |
| Intended models | Generalized: evaluate instruction sufficiency and unnecessary explanation on each intended model. Excluded: family-based guidance assumptions. | A03 |
| Naming conventions | Retained: descriptive, consistent names and useful alternatives. Generalized: client-specific reserved-name rules. | A04 |
| Effective descriptions | Retained: capability plus triggers, specific terms, discovery examples, and vague counterexamples. | A05 |
| Progressive disclosure | Retained: overview plus detail, under-500-line recommendation, and splitting before complexity grows. Generalized: context-loading behavior. | A06 |
| Visual resource overview | Retained: metadata, references, scripts, PDF extraction, field branches, JSON, and argument checks. | A07, A18 |
| Overview with references | Retained: quick start and direct form, API, and example links. | A07 |
| Domain organization | Retained: finance, sales, product, and marketing references with focused searches. | A07–A08, A22 |
| Conditional detail | Retained: basic and advanced paths, document creation, tracked changes, and format internals. | A07, A09 |
| Reference depth | Retained: direct links and the partial-read risk of nested chains or previews. | A08 |
| Long-reference contents | Retained: contents lists for references longer than 100 lines. | A08 |
| Complex workflows | Retained: ordered research and PDF workflows with conditional branches. | A09 |
| Feedback loops | Retained: check, fix, and recheck before accepting outputs. | A10 |
| Time-sensitive information | Retained: current methods and isolated historical patterns, not live calendar branches. | A11 |
| Terminology | Retained: one term for each meaning without merging distinct concepts. | A11 |
| Templates | Retained: strict or flexible structure according to the output contract. | A12 |
| Examples | Retained: input/output pairs and commit-message patterns with useful detail. | A12 |
| Conditional workflows | Retained: library-based creation versus XML editing and checks before repacking. | A09 |
| Evaluations first | Retained: observed gaps, three scenarios, appropriate baseline, minimal edits, and complete-output criteria. | A13 |
| Iterative development | Generalized: separate refining and fresh using agents. Retained: reusable task facts, concrete failures, and reevaluation. | A14 |
| Team feedback | Retained: domain expertise and observed activation, clarity, and missing guidance. | A14 |
| Resource navigation | Retained: unexpected order, missed links, repeated reads, ignored resources, and discovery checks. | A15 |
| Cross-platform paths | Retained: forward slashes. | A16 |
| Useful defaults | Retained: preferred approach with a specific fallback, including scanned-PDF OCR. | A16 |
| Executable skills | Retained: applicable script requirements. Non-script targets omit irrelevant checks. | A17–A23 |
| Explicit recovery | Retained: actionable errors and reasons for constants. Permission-error examples do not authorize hidden data loss. | A17 |
| Utility scripts | Retained: documented inputs, outputs, dependencies, field data, overlap checks, and run-versus-read intent. | A18 |
| Visual analysis | Retained: inspect page layouts, field positions, and types with available tools. | A19 |
| Intermediate outputs | Retained: checked plans before execution, specific errors, original preservation, and required approval. | A20 |
| Dependencies | Generalized: installation depends on actual tools, network policy, permissions, and runtime restrictions. | A21 |
| Runtime environment | Generalized: filesystem, code tools, metadata loading, and script-output context behavior need client support. | A06–A08, A18, A22 |
| MCP tool references | Retained: qualified identifiers and examples. Generalized: qualification syntax depends on the client. | A23 |
| Installed tools | Retained: check package availability before use. Example installation commands do not grant permission. | A21 |
| Frontmatter | Generalized: source limits and field rules need schema checks. Excluded: vendor-specific reserved-word names. | A04 |
| Token budgets | Retained: the line-count recommendation is not a hard token allowance. | A06 |
| Core-quality checklist | Retained: discovery, stable content, concrete examples, direct links, and clear workflows. | A24 |
| Script checklist | Retained: recovery, constants, dependencies, documentation, paths, plans, and feedback loops. | A24 |
| Evaluation checklist | Generalized: intended models and clients replace a named-family checklist. Retained: representative tasks and applicable feedback. | A03, A13–A15, A24 |
| Next steps | Generalized: relevant client documentation before installation or deployment. No implicit deployment authority. | A24 |

## Workflow source

| Source topic | Treatment | Destination |
| --- | --- | --- |
| Introduction and starting advice | Retained: whole tasks, completion and escalation, redundant-thinking removal, and pending user needs first. | R01–R02 |
| Whole-task completion | Retained: migration endpoints, old-client removal, passing tests, and unexplained-failure escalation. | R02 |
| Generic thinking demands | Retained: evaluate redundant-language removal and direct simple answers. Excluded: model-specific latency and effort claims. | R03, R11 |
| Mid-run additions | Generalized: supported follow-up instructions without restarting unrelated work. Excluded: client keystrokes. | R05 |
| Design exclusions | Retained: specific unwanted patterns and iterative inspection. Example preferences remain optional. | R14 |
| Required and premature stops | Retained: four early-stop failures, brief updates, safe approval, and interactive alternatives. Excluded: vendor-specific instruction filename. | R05 |
| Subagents | Retained: independent scopes, pending results, checked evidence, and service-audit table. | R06 |
| Durable task lists | Retained: completed, discovered, and remaining work through context summarization. | R05 |
| Pending user needs | Retained: blocking decisions first and example final headings. | R15 |
| Code review | Retained: scoped diff review, file and line evidence, failure explanations, and reproductions. Excluded: comparative model anecdote. | R15 |
| Uncertainty | Retained: unconfirmed findings and search locations. | R15 |
| App model selection | Excluded: vendor picker instructions and named-model assumptions. Generalized: check actual visual capabilities. | R13 |
| Original visuals | Retained: charts, screenshots, specific questions, and spatial meaning. | R13 |
| Long documents | Retained: names, dates, figures, contradictions, quotations, and source locations. | R15 |
| Finished files | Retained: usable artifacts and vendor-row spreadsheet example. | R15 |
| Settled short answers | Retained conditionally: evaluate the shortcut without suppressing new-evidence correction or long-task analysis. | R11 |
| Flagged messages | Excluded: named safeguard comparisons and exact fallback behavior. Retained: no safeguard bypass and visible declines. | R07 |
| App flag controls | Excluded: vendor notices, menus, model switching, and new-chat advice. | R07 contains only portable safeguards. |
| Coding-client flag controls | Excluded: model-selection commands, edit shortcuts, configuration commands, and vendor feedback commands. | R07 contains only portable safeguards. |
| Private reasoning | Retained: concise explanations instead of private reasoning reproduction. Excluded: exact classifier behavior. | R04, R07 |
| Fast mode | Excluded: command, preview status, and vendor billing requirements. Generalized: documented performance-mode checks. | R16 |
| Final checklist | Retained where applicable: completion, design, visuals, approval, delegation, tracking, review, and uncertainty. Excluded: switching preferences. | R02, R05–R07, R11, R13–R16 |

## Prompting source

| Source topic | Treatment | Destination |
| --- | --- | --- |
| Introduction and symptom routing | Retained: select changes by observed need and preserve a baseline. Excluded: named-version and output-speed comparisons. | R01 |
| Capabilities | Excluded: model-specific quality, token, effort, and success comparisons. Retained elsewhere: concrete review, artifact, and visual checks. | R01, R13, R15 |
| Effort calibration | Generalized: check supported controls, limits, accounting, and cache effects. Excluded: defaults, maximums, exact parameter semantics, and beta controls. | R03 |
| Legacy integration migration | Generalized: recheck mitigations and documented response parsing. Excluded: version-specific compatibility, display values, and refusal categories. | R04 |
| Unattended runs | Retained: turns are not completion, open-item checks, bounded continuation, checked background output, and approval. Excluded: exact signals and system timing rules. | R05, R08 |
| Safeguard refusals | Excluded: classifier categories, program links, fallback policies, and exact response fields. Retained: applicable safeguards and concise explanations. | R07 |
| Progress updates | Generalized: transport, verbatim content, cadence, and bounded reminders. Excluded: headers, display values, reminder constants, cache claims, and performance results. | R08 |
| Context across apps | Retained: relevant unnamed sources and untrusted-record boundaries. Excluded: effort-level correctness and token comparisons. | R09 |
| Time signals | Retained: measured elapsed time, advisory budgets, hard timeouts, local evaluation, and quality limits. Excluded: reported team speed comparisons. | R10 |
| Thinking instructions | Retained conditionally: redundant-language removal and settled-answer limits. Excluded: source-specific latency results. | R11 |
| Pasted text | Retained: application-generated wrappers, authority limits, hidden identifiers, and imitable-tag warning. Excluded: comparative injection-resistance claim. | R12 |
| Visual tools | Retained: original images, resolution, crops, dimensions, coordinates, costs, and tool checks. Excluded: model-specific effort comparisons and vendor recipe link. | R13 |
| Frontend defaults | Retained: specific exclusions and iterative inspection. Implementation examples are not required defaults. | R14 |

## Existing advice and safeguards

| Baseline requirement | Retained destination |
| --- | --- |
| Existing-skill tuning, stable identity, manual invocation, bounded scope, and justified no-edit results | Main introduction, frontmatter, scope, and workflow |
| Purpose, trigger, outputs, supported clients, safety, and useful analysis | Main scope and editing step |
| Applicable references before review, not checklist-only edits | Main navigation and justified-edit step |
| Maintained source resolution, not generated or read-only copy edits | Main scope |
| Audit-only means no edits or unrelated configuration changes | Main scope |
| Documented runtime controls or explicit uncertainty | Main scope, R03–R04, R08 |
| Higher-priority instructions and untrusted-source boundaries | Main scope, R09, R12 |
| Read targets, references, tests, local guidance, and working-tree changes | Baseline step |
| Save originals and preserve uncommitted changes | Baseline step |
| Current behavior, proposed change, expected benefit, check, and source evidence | Justified-edit step |
| Small edits and no filler replacements for thinking commands | Justified-edit and editing steps |
| Preserve frontmatter, formats, links, approvals, interaction, and analysis | Editing step |
| No generic continuation or reduced-thinking instruction | Editing step |
| Diff, frontmatter, links, tests, and normal versus stop scenarios | Check step |
| Matched configuration, disposable copies, quality first, and preservation of unrelated changes | Check step |
| Structural, manual, and actual-run evidence remain separate | Reporting step |
| Tested configuration, missing runs, and no unmeasured cross-model gains | Reporting step |
| Blockers first and separate runtime suggestions | Reporting step, R15 |
| Completion without losing destructive, irreversible, external, or out-of-scope approval | Main scope and editing step, R02, R05 |
| Usable artifacts unless the user requested an outline or plan | Editing step, R15 |
| Background work pending until checked, except explicit launch-only requests | Editing step, R05–R06 |
| Observable rationale and evidence, not private reasoning requests | Editing step, R04, R11 |
| Useful task tracking and supported delegation with checked evidence | Editing step, R05–R06 |
| Uncertainty and source locations without invented findings | Reporting step, R15 |
| Prompt text does not configure runtime features | Main scope and prompt-principles runtime boundaries |
| All 13 prompting hypotheses and their operational limits | Prompt-principles prompting table |
| Source rechecks and documented behavior separate from adaptations | Prompt-principles sources section |
| Runtime summaries | R03–R13, R16 retain only portable checks and limits. Exact controls and model claims are excluded. |
| Nine evaluation cases and their underlying safety or evidence scenarios | All evaluations remain unchanged by simplification. |
| Intentional fixture defects and required approvals | Both fixtures remain unchanged by simplification. |

## Adaptations and exclusions

- Existing-skill tuning uses the saved old skill.
  New-skill methods retain the no-skill comparison without authorizing creation.
- Error recovery does not authorize empty success outputs, permission bypass, or unapproved files.
- Naming guidance does not authorize automatic renaming of target skills.
  Illustrations do not override an applicable metadata schema.
- Runtime capabilities determine schema limits, dependencies, tools, and response handling.
  Vendor assumptions are not portable defaults.
- Unattended continuation cannot replace teaching pauses, protected access, or approval.
  The harness supplies bounds and completion events.
- Model-specific behavior and performance claims are excluded rather than renamed as universal facts.
  The three original source URLs remain for attribution.
- Generic safeguards replace vendor-specific refusal and fallback instructions.
  No source advice authorizes safeguard bypass.
- Historical verification remains distinct from checks of the current rewrite.
  Revised prompts and prose do not establish behavioral improvement.

## Maintenance rule

1. Before you update source-derived advice, read its surrounding examples and caveats.
2. Update the destination.
3. Update this map's treatment and destination.
4. For consolidated advice, preserve conditions and limits.
5. Record exclusions explicitly.
6. Do not mark coverage complete while a source topic or required safeguard remains unresolved.
