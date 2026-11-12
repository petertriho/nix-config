# Source coverage map

This map separates retained lessons from generalized advice and excluded runtime-specific details.
It does not claim that every source recommendation remains an instruction.
Source topics use neutral labels rather than model or vendor names.

## Contents

- [Sources and reading evidence](#sources-and-reading-evidence)
- [Skill-authoring source](#skill-authoring-source)
- [Workflow source](#workflow-source)
- [Prompting source](#prompting-source)
- [Client practice source](#client-practice-source)
- [Adaptations and exclusions](#adaptations-and-exclusions)
- [Maintenance rule](#maintenance-rule)

## Sources and reading evidence

The last complete read of these primary sources was on 2026-10-06:

- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- [Agent workflow guidance](https://claude.dev/blog/getting-the-most-out-of-opus-5-5/)
- [Prompting and runtime guidance](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)

That read used the Markdown versions of both documentation pages and text extracted from the article HTML.
It included code blocks, notes, warnings, tips, the three authoring diagrams, and the article's image descriptions.
The diagrams repeat the A07 resource patterns.
The article's image descriptions repeat its task, stop, delegation, and checklist lessons.

The read found six unrecorded source points:

- The third-person description rule now appears in A05.
- The large-workflow file split now appears in A09.
- The completion checker and continuation messages now appear in R05.
- Instruction costs now appear in R05, R09, and R12.
- The removal of generic reasoning bans now appears in R03 and R11.
- The claim that models know the skill format natively is excluded.

An earlier complete read on 2026-10-04 reported no hidden tab or expandable-section advice.

The first complete read of a fourth primary source was on 2026-11-12:

- [Client best practices](https://code.claude.com/docs/en/best-practices)

That read used the page's Markdown version.
It included all notes, warnings, tips, tables, and code blocks.
The page has no hidden tabs or expandable sections.
Its linked pages remain unread.

Coverage concerns these four primary sources, not every page they link.

All operational references link directly from `SKILL.md`.
Sections **A01–A24** identify [skill-authoring practices](skill-authoring.md).
Sections **R01–R18** identify [runtime guidance](runtime-guidance.md).
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
| Effective descriptions | Retained: third-person point of view, capability plus triggers, specific terms, discovery examples, and vague counterexamples. | A05 |
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
| Conditional workflows | Retained: library-based creation versus XML editing, checks before repacking, and separate files for large workflows. | A09 |
| Evaluations first | Retained: observed gaps, three scenarios, appropriate baseline, minimal edits, and complete-output criteria. | A13 |
| Iterative development | Generalized: separate refining and fresh using agents. Retained: reusable task facts, concrete failures, and reevaluation. Excluded: the claim that models know the skill format natively, because portable skills cannot assume it. | A14, main check step |
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
| Effort calibration | Generalized: check supported controls, limits, accounting, and cache effects. Retained: prefer a documented reasoning control to prompt text. Excluded: defaults, maximums, exact parameter semantics, and beta controls. | R03 |
| Legacy integration migration | Generalized: recheck mitigations and documented response parsing. Retained: remove generic rules that forbid reasoning, and measure quality for any direct-answer instruction. Excluded: version-specific compatibility, display values, and refusal categories. | R04, R11 |
| Unattended runs | Retained: turns are not completion, completion conditions, open-item checks, continuation messages, separate checker models, bounded continuation with the two-or-three example, checked background output, approval, and added tool-call cost. Excluded: exact signals and system timing rules. | R05, R08 |
| Safeguard refusals | Excluded: classifier categories, program links, fallback policies, and exact response fields. Retained: applicable safeguards and concise explanations. | R07 |
| Progress updates | Generalized: transport, verbatim content, cadence, and bounded reminders. Excluded: headers, display values, reminder constants, cache claims, and performance results. | R08 |
| Context across apps | Retained: relevant unnamed sources, untrusted-record boundaries, and added tool-call cost. Excluded: effort-level correctness and token comparisons. | R09 |
| Time signals | Retained: measured elapsed time, advisory budgets, hard timeouts, local evaluation, and quality limits. Excluded: reported team speed comparisons. | R10 |
| Thinking instructions | Retained conditionally: redundant-language removal and settled-answer limits. Excluded: source-specific latency results. | R11 |
| Pasted text | Retained: application-generated wrappers, authority limits, hidden identifiers, imitable-tag warning, and possible added caution. Excluded: comparative injection-resistance claim. | R12 |
| Visual tools | Retained: original images, resolution, crops, dimensions, coordinates, costs, and tool checks. Excluded: model-specific effort comparisons and vendor recipe link. | R13 |
| Frontend defaults | Retained: specific exclusions and iterative inspection. Implementation examples are not required defaults. | R14 |

## Client practice source

This guide addresses one coding-agent client.
Its commands, settings files, flags, constants, and model defaults are excluded.
Its portable lessons keep capability checks.

| Source topic | Treatment | Destination |
| --- | --- | --- |
| Introduction and client defaults | Retained: leave defaults until a task costs more than it should. Excluded: the default permission mode, delegation, and context summarization of one client. | R01 |
| Knowledge that defaults cannot see | Retained: undocumented procedures, files that must never be read, required checks, and budgets. | A01, A10, R17, R18 |
| Symptom routing | Retained: missing information, absent checks, rules that need enforcement, and excess cost each need a different fix. | A01, A10, R01, R17 |
| Team setup note | Excluded: the linked organization page is outside this read. | None |
| Guidance versus enforcement | Retained: the five-row table, model judgment of guidelines, zero-exception examples, emphasis as a signal, and removal of hooks for preferences. Generalized: client control names. | R17, A14 |
| Information the agent cannot see | Retained: the two-question test, examples of facts outside the repository, and costly rediscovery. | A01 |
| Specific prompts | Retained: file, symptom, definition of fixed, and stated preferences, with both table examples as patterns. Generalized: supply the artifact instead of a description. Excluded: file-mention syntax and the pipe command. | R02, R13 |
| Thinking phrases and scope | Retained: phrases nudge within the effort setting, "be ambitious" states scope, and open exploratory prompts trade more corrections. | R03, R11 |
| Interviews and specs | Retained: multiple-choice interview, spec file, fresh build context, and spec as the review target. | R02, R15 |
| Short instruction files | Retained: attention cost per line, the four content categories, command-only check lines, and the stale, missing-file, and contradiction audit. Excluded: the example file, load-check, generation, and doctor commands, the 200-line memory recommendation, and the personal-preference file. | A01, A10, A11, A14 |
| Path-scoped rules | Excluded: client instruction files and their path filter are outside this skill's edit scope. Generalized: conditional loading remains in A06 and A22. | A06, A22 |
| Team procedures in skills | Retained: team knowledge belongs in skills, metadata-first loading, the same discoverability rule, manual invocation for side effects, and the release example. Generalized: the frontmatter field name. | A01, A05, A09 |
| External tools | Retained: installed CLIs, `--help` for unfamiliar CLIs, and context cost of connected tool servers. Excluded: the server-add command, the server menu, and code-intelligence plugins. | A21, A23 |
| Checks to run | Retained: "looks done" stops, pass or fail checks, the five check types, the check command, the four strictness levels, evidence requests, and app runs that catch what tests miss. Excluded: goal, verify, and review commands. | A10, R05, R15, R17 |
| Review against a spec | Retained: the review prompt pattern, correctness-only scope, skip style, and the cost of fixes for every finding. | R15, main justified-edit step |
| Stop-check enforcement | Generalized: a harness stop check with a block limit. Excluded: the settings JSON, exit code, stderr routing, eight-block constant, and environment variable. | R05, R17 |
| Rules without exceptions | Retained: the three example rules and the move from guidance to harness configuration. Generalized: keep the skill rule, because tuning cannot change configuration. | R17 |
| Hooks | Retained: model-judged hooks are not enforcement, block on failure for security checks, and zero-exception scope. Excluded: hook types, event names, JSON, and the formatter command. | R17 |
| Permission rules and sandbox | Retained: deny rules across modes, the read-rule and fetch-rule gaps, sandbox confinement, and classifier limits. Excluded: rule syntax, mode names, supported platforms, and the strict-mode menu. | R17 |
| Rule scope | Retained: user, repository, and organization scopes, managed policy precedence, and a small enforced set. Excluded: file paths and trust dialogs. | R17 |
| Default changes and usage | Retained: inspect usage before changes. Excluded: the usage command, the default model, and plan names. | R01 |
| Permission modes | Retained: approval fatigue, deterministic rules before the classifier, actions driven by retrieved content, and conversational approvals lost in summaries. Excluded: mode names, block thresholds, configuration keys, the defaults warning, and commands. | R05, R09, R12, R17 |
| Model and effort | Retained as hypotheses: raise, lower, and maximum effort cases, per-message deeper reasoning, and smaller models for simple delegated jobs. Excluded: model names, defaults, commands, and the keyword. | R03, R06 |
| Delegation costs | Retained: four payoff situations, token and time costs, no better answer, smaller models, short summaries, usage checks, and enforced tool limits. Excluded: built-in agent names, fork mode, and definition syntax. | R06, R15 |
| Cost and context | Retained: resent history, fresh contexts between tasks, focused summaries, and background requests. Excluded: window size, cache durations, plan names, and the 10% usage flag. | R05 |
| Session steering | Retained: a fresh context after two failed corrections, and checkpoints that miss shell changes. Excluded: keys, rewind and side-question commands, and session naming. | A14, R01 |
| Unattended runs | Retained: the five preflight questions and human sign-off. | R18 |
| Scripted runs | Retained: tool pre-approval, refusal of other prompts, caps, parsable results, ambient-configuration isolation, and a three-file pilot. Excluded: flags, authentication sources, and output formats. | R18 |
| Scheduled and event runs | Retained: something must start a run, loop cost in long conversations, branch protection, and watching the first runs. Excluded: commands, login requirements, and trigger setup. | R18 |
| Parallel sessions | Retained: separate checkouts, missing ignored files and dependencies, setup commands, cleanup, plan approval for batch changes, and a second session as reviewer. Excluded: commands, the include file, settings, cleanup periods, and the 5-to-30-unit split. | A20, A21, R15, R18 |
| Advice to stop | Retained: emphasis, delegation for context or quality, thinking phrases, keep-going lines, and layout descriptions. Generalized: busywork can signal an obsolete workaround. Excluded: the 1M-token window. | A01, A14, R03–R06, R11, main editing step |
| Related resources | Excluded: linked pages are outside this read. | None |

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
  The four source URLs remain for attribution.
- Generic safeguards replace vendor-specific refusal and fallback instructions.
  No source advice authorizes safeguard bypass.
- Client-guide enforcement advice becomes runtime suggestions.
  Tuning keeps the skill's own rules and changes no configuration.
- Historical verification remains distinct from checks of the current rewrite.
  Revised prompts and prose do not establish behavioral improvement.

## Maintenance rule

1. Before you update source-derived advice, read its surrounding examples and caveats.
2. Update the destination.
3. Update this map's treatment and destination.
4. For consolidated advice, preserve conditions and limits.
5. Record exclusions explicitly.
6. Do not mark coverage complete while a source topic or required safeguard remains unresolved.
