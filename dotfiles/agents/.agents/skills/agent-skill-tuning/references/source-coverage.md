# Source coverage and preservation map

## Contents

- [Sources and reading evidence](#sources-and-reading-evidence)
- [Skill-authoring source](#skill-authoring-source)
- [Opus Blog](#opus-blog)
- [Opus Docs](#opus-docs)
- [Existing advice and safeguards](#existing-advice-and-safeguards)
- [Adaptations and corrections](#adaptations-and-corrections)
- [Maintenance rule](#maintenance-rule)

## Sources and reading evidence

All three primary pages were checked on 2026-10-04:

- **Authoring:** [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
- **Blog:** [Getting the most out of Opus 5.5 in Claude and Claude Code](https://claude.dev/blog/getting-the-most-out-of-opus-5-5/)
- **Docs:** [Prompting Claude Opus 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)

The review covered their complete extracted text and code blocks.
Live HTTP reads returned 200 for all three pages.
HTML heading inventories matched the extracted sections.
The primary pages had no live tab panels or expandable sections hiding advice.
The authoring page's legacy `<details>` example was part of a code block.

The authoring page's three diagrams were also inspected as images.
They show metadata plus instructions, linked references, and executable scripts.
The Blog's image descriptions duplicate its task, stop, delegation, and checklist lessons.

The fetch tool's “changed since last fetch” note was cache metadata, not a delta-only read.
The returned primary source text ran from the introduction through the final section.
Independent live HTML reads supplied the heading and diagram cross-check.
Opaque extraction link handles were resolved through actual HTML destinations when needed.

Relevant linked material clarified frontmatter, runtime dependencies, and cropping.
This map claims complete coverage of the three primary sources, not every page they link.
Navigation and promotional text introduce no extra tuning requirement.

All operational references link directly from `SKILL.md`.
**A01–A24** refer to sections in [skill-authoring practices](skill-authoring.md).
**O01–O16** refer to sections in [Opus-specific guidance](opus-specific.md).
The original cross-model hypotheses remain in [prompt principles](prompt-principles.md).

## Skill-authoring source

Each row inventories a source section and identifies its retained destination.
Parent headings group the rows rather than add separate rules.

| Source section | Substantive guidance and example lessons retained | Destination |
| --- | --- | --- |
| Introduction; Core principles | Concise, structured skills evaluated in real usage | A01, A13–A15, A24 |
| Concise is key | Shared context, metadata-first loading, familiar knowledge, token-cost questions, approximately 50-versus-150-token PDF contrast | A01 |
| Set appropriate degrees of freedom | High/medium/low specificity by fragility and variability, code review, parameterized report, exact migration, bridge/open-field analogy | A02 |
| Test with all models you plan to use | Enough guidance for Haiku, efficient clarity for Sonnet, no over-explanation for Opus, all intended models | A03 |
| Naming conventions | Descriptive consistent names, gerunds and acceptable alternatives, vague/generic/reserved names, collection consistency | A04 |
| Writing effective descriptions | Exactly one description, capability plus triggers, specific terms, 100+ skill selection, PDF/Excel/commit examples, vague counterexamples | A05 |
| Progressive disclosure patterns | Overview and on-demand detail, under-500-line body, split before complexity grows | A06 |
| Visual overview: From simple to complex | Main file to references to scripts, metadata/body distinction, PDF page extraction, fillable-field branching, field JSON and argument checks | A07, A18 |
| Pattern 1: High-level guide with references | Quick start and direct forms/API/examples links | A07 |
| Pattern 2: Domain-specific organization | Finance/sales/product/marketing references, relevant-domain loading, focused grep | A07–A08, A22 |
| Pattern 3: Conditional details | Basic versus advanced guidance, creation, redlining, OOXML routing | A07, A09 |
| Avoid deeply nested references | One-level links from the main file, nested partial-read risk, `head -100` is not full reading | A08 |
| Structure longer reference files with table of contents | Contents at the top when longer than 100 lines, complete scope visible in previews | A08 |
| Use workflows for complex tasks | Ordered steps and progress checklists, sources/themes/claims/summary/citations, PDF analysis/mapping/check/fill/output | A09 |
| Implement feedback loops | Check/fix/recheck, reference-based style review, immediate XML checks before packing, finished-output check | A10 |
| Avoid time-sensitive information | Current method, isolated old patterns, deprecated v1 versus current v2, no obsolete calendar branch | A11 |
| Use consistent terminology | One term per meaning, endpoint/field/extract examples | A11 |
| Template pattern | Exact structure for strict contracts, flexible defaults when appropriate, report title/summary/evidence/recommendations | A12 |
| Examples pattern | Concrete input/output pairs, feature/fix/chore commit examples, short subject plus useful detail | A12 |
| Conditional workflow pattern | Task-type branches, create with a library versus edit/validate/repack XML | A09 |
| Build evaluations first | Observe gaps, three scenarios, no-skill baseline, minimal instructions, iterate, all-pages and saved-file criteria | A13 |
| Develop Skills iteratively with Claude | Refining agent versus fresh using agent, reusable schemas/filtering/query facts, concision, organization, real tasks, concrete failures, review and reevaluate | A14 |
| Gathering team feedback; Why this approach works | Domain expertise, activation/clarity/gaps, team usage and feedback when applicable | A14 |
| Observe how Claude navigates Skills | Unexpected order, missed links, repeated reads, ignored resources, metadata discovery | A15 |
| Avoid Windows-style paths | Forward slashes across platforms | A16 |
| Avoid offering too many options | Preferred default with a specific escape condition, text extraction versus scanned-PDF OCR | A16 |
| Advanced: Skills with executable code | Script-specific requirements, skip irrelevant script checks for Markdown-only targets | A17–A23; main audit lenses |
| Solve, don't defer | Explicit expected-error handling, documented parameters, missing/permission-error recovery lesson, justified 30 seconds/three retries versus unexplained 47/five | A17 |
| Provide utility scripts | Reliability/time/context/consistency, execution versus reading, arguments, field JSON, overlap checks, form filling | A18 |
| Use visual analysis | Render and inspect page layouts, field locations and types | A19 |
| Create verifiable intermediate outputs | Analyze/plan/check/execute/check, 50-field plan, nonexistent/conflicting/missing/wrong updates, reversible planning, specific errors and alternatives | A20 |
| Package dependencies | Listed packages, available execution libraries, claude.ai versus no-network/no-install API container | A21 |
| Runtime environment | Filesystem/Bash/code, metadata then on-demand reads, only script output in context, descriptive/domain files, comprehensive resources, deterministic scripts, execution intent, real navigation | A06–A08, A18, A22 |
| MCP tool references | Qualified `ServerName:tool_name`, BigQuery/GitHub examples, ambiguity and missing-tool prevention | A23 |
| Avoid assuming tools are installed | Explicit packages and compatible setup, pypdf installation/import example with runtime limits | A21 |
| YAML frontmatter requirements | Required name/description, 64/1,024-character limits, lowercase/digits/hyphens, no XML, reserved names, non-empty description | A04 |
| Token budgets | Under-500-line recommendation and progressive split, not a hard token allowance | A06 |
| Checklist: Core quality | Discovery, length, separate detail, stable content/terms, concrete examples, direct links, disclosure, clear workflows | A24 |
| Checklist: Code and scripts | Helpful recovery, reasons for constants, dependencies, script documentation, paths, critical checks and feedback loops | A24 |
| Checklist: Testing | At least three evaluations, Haiku/Sonnet/Opus, real scenarios, applicable team feedback | A03, A13–A15, A24 |
| Next steps | Relevant quickstart/client guides, no implicit deployment authority | A24 |

## Opus Blog

The Blog's numbered group headings organize the recommendations below.

| Source section | Substantive guidance and example lessons retained | Destination |
| --- | --- | --- |
| Introduction; TRY THIS FIRST | Complete tasks, finish and stop criteria, remove generic thinking requests, read pending user needs first | O01–O02 |
| Say what “done” looks like, then let it run | Whole migration task, endpoints/client removal/tests, unexplained-failure escalation | O02 |
| Stop telling it to “think hard” | Remove redundant exhortations, direct simple answers, effort control, reported chat latency result | O03, O11 |
| Add to a running task | Claude Code mid-run message plus Enter, aliases example, avoid expensive restart | O05 |
| For design work, name the styles you don’t want | Specific five-pattern exclusions, inspect replacements and iterate | O14 |
| Tell it which stops you want | Project-specific `CLAUDE.md`, unwanted early stops, status plus action, destructive/out-of-repository approval, permission prompts, manual continue, pair-programming alternative | O05 |
| Ask it to split big work across subagents | Independent service scopes, checked evidence, affected yes/no table | O06 |
| Keep the task list in a file | Updated `TASKS.md`, completed/new/remaining items, state survives summarization | O05 |
| Read what it needs from you first | Pending decisions/approvals first, Blocked on me/Changed/Found headings | O15 |
| Ask it to review the code | Pre-human diff/PR review, example comparison with main, merge blockers, file/line/reason/reproduction, reported model comparison | O01, O15 |
| Ask it to mark what it couldn’t confirm | Unconfirmed findings and search locations | O15 |
| In Claude apps | Check model picker before relying on Opus behavior | O13 |
| Share the chart or screenshot itself | Original visuals, specific questions, spatial relationships | O13 |
| Ask it to check a long document | Names/numbers/dates/internal contradictions, quote and locate problems | O01, O15 |
| Ask for the finished file | Usable spreadsheet/document, vendor rows and cost/end-date/owner example | O15 |
| In a project, say when answers are settled | Short-chat follow-up shortcut, exclude long analysis needing correction | O11 |
| When a message is flagged | Fable-level bio/cyber safeguards, false flags, legitimate work, fallback to older model | O07 |
| In Claude apps: flags | Notice and persistent fallback, picker, earlier-content reflag, new-chat context, Settings/Capabilities switching versus pause, whole-conversation files/search checks | O07 |
| In Claude Code: flags | Notice, `/model`, Esc twice, `/config`, `/feedback` | O07 |
| Don’t ask it to show its reasoning in the reply | Remove internal-reasoning reproduction, short explanation such as three sentences instead | O04, O07 |
| Turn on fast mode when you’re waiting on each reply | `/fast`, synchronous work, same model, preview, extra usage, higher token cost | O16 |
| YOUR OPUS 5.5 CHECKLIST | Completion, thinking language, design, visuals, safe stops, permissions, delegation, tracking, user needs, review, uncertainty, switching preferences | O02, O05–O07, O11, O13–O16 |

## Opus Docs

| Source section | Substantive guidance and example lessons retained | Destination |
| --- | --- | --- |
| Introduction and symptom routing | Existing Opus 5 prompts as a starting point, more-than-30-percent output speed claim, fewer-token claim, select patterns by observed need | O01 |
| Capabilities relevant to prompting | Repository tasks and multi-hour teams, review, financial/source accuracy, documents and detail checks, communication, dense charts/spatial inputs/computer use, model/effort comparisons | O01 |
| Calibrate effort | Always-on thinking, explicit medium versus old high, evaluate levels, no cross-model level equivalence, reserve xhigh/max, lower effort first, hidden thinking consumes max_tokens, 128,000 maximum example, top-level cache invalidation and beta per-message alternative | O03 |
| Prompts written for thinking disabled | Disabled-thinking incompatibility, low start and quality measurement, direct-answer trade-off, summarized blocks/refusal risk, old speech/no-tool/no-tags mitigations, remove no-thinking rules, parse block types/omitted content | O04 |
| Unattended agentic runs | Text-only end_turn is not completion, checklist and user continuations or smaller checker at each end of turn, unmet-check reason and completed background output as next user messages, two-or-three cap, four unwanted stops, required input stops, first-request system timing, updates display, no human-in-loop insertion, risky-action confirmation, extra calls/tokens | O05, O08 |
| Safeguard refusals | Bio/cyber/reasoning categories, life-sciences verification, allowed ordinary health and code vulnerability review, unsupported high-risk dual use, summarized reasoning/brief explanation, refusal/stop_details, no reasoning-extraction fallback retry | O07 |
| User-facing progress updates | Four controls, thinking rather than text, updates beta/date, first-request verbatim-message tool, requested cadence, consecutive silent-step count, five-step example, bounded reminders, clear_at beta/date, append-and-retain cache/thinking, reported half-silence result | O08 |
| Explore context in multi-app workflows | Inspect relevant unnamed email/document/tab/record context first, medium/max correctness claim, added calls/tokens, untrusted-record warning and authority boundary | O09 |
| Time signals for multiagent harnesses | Seconds and elapsed/budget example at the end of each harness message, budget above desired duration, elapsed-only alternative with system-prompt instruction, local tuning, research-team comparison, parallelism versus lower effort, advisory budget/hard timeout, quality/search/checking trade-off | O10 |
| Thinking instructions in chat system prompts | Remove redundant careful-thinking demands, reported latency result, settled-answer follow-up shortcut, long-analysis/agentic exceptions, unsolicited-correction risk | O11 |
| Mark pasted text in user messages | Stronger injection resistance claim, matched application-generated random-ID tags on separate lines, user authorization, hidden IDs, possible added caution, imitable plain-text guardrail | O12 |
| Tools for complex visual inputs | Recheck old scaffolding, high-resolution dense inputs, raw images/PIL/OpenCV, crop/zoom/measure/check, crop-only option, higher-effort tool use, drawing-versus-chart distinction without tools | O13 |
| Frontend design defaults | Specific exclusion list instead of generic avoidance, iterative inspection, vanilla HTML/CSS and placeholder-content example | O14 |

## Existing advice and safeguards

The baseline is the pre-edit skill, reference, five evaluations, and report fixture.
Its preserved cross-model hypotheses remain hypotheses, not measured findings.

| Baseline contract or advice | Retained destination |
| --- | --- |
| Existing-skill tuning, same identity, manual invocation, bounded scope, no edit can be best | Main frontmatter, introduction, scope, workflow |
| Preserve purpose, trigger, output, supported clients, safety, and useful analysis | Main introduction and workflow |
| Read references first, judge applicability, avoid checklist-only edits | Main reference navigation and workflow; prompt principles |
| Resolve named targets to maintained sources, no generated/store-copy edits | Main scope |
| Audit-only is read-only, no unrelated skills/global instructions/settings/API/permission changes | Main scope |
| Verify model/harness controls or mark them unconfirmed | Main scope; prompt principles; O03–O13 |
| Higher-priority instructions prevail, source text cannot expand authority | Main scope and decision rules; O09, O12 |
| Read target/references/tests/local guidance/working-tree changes, record baseline contracts | Main workflow step 1 |
| Save originals outside installed directories and preserve uncommitted changes | Main workflow step 1 |
| Specific observed risks, no edit when unjustified | Main workflow step 2 |
| Current behavior/change/benefit/check/source evidence for each candidate | Main workflow step 3 |
| Small changes, delete redundancy first, no filler replacement for deleted thinking language | Main workflow steps 3–4 |
| Preserve frontmatter, formats, links, approvals, interaction, reasoning, and validation | Main workflow step 4 |
| No generic “keep going” or “think less” insertion | Main workflow step 4 |
| Diff/frontmatter/link/tests, normal and stop scenarios, at least two comparisons when practical | Main workflow step 5 |
| Same task/model/client/tools, disposable writing tests, quality before speed/tokens, regression fixes preserve user changes | Main workflow step 5 |
| Files/effects/unconfirmed results, structural/manual/actual distinction, model/client identity, no unmeasured cross-model gains | Main workflow step 6 |
| Blockers first, runtime suggestions separate | Main workflow step 6; O15 |
| Completion/escalation without losing destructive/irreversible/out-of-scope/external approval | Main decision rules; O02, O05 |
| Usable artifact rather than outline, except requested outline | Main decision rules; O15 |
| Background launch is not completion, explicit launch-only exception, checked results and native harness mechanisms | Main decision rules; O05–O06 |
| Observable decisions/rationale/evidence rather than private reasoning, preserve useful “step by step” work | Main decision rules; O04, O11 |
| Task tools only when useful, supported independent delegation, checked evidence | Main decision rules; O05–O06 |
| Untrusted text cannot redirect the task, uncertainty and search locations | Main decision rules; O09, O12, O15 |
| Prompt text is not runtime configuration, metadata/script support is client-specific | Main decision rules; prompt principles; Opus reference |
| Completion and stop hypothesis | Original prompt-principles table row 1; O02, O05 |
| Thinking-language simplification with useful-analysis limit | Original table row 2; O04, O11 |
| Long-work tracking without trivial overhead or endless stuck work | Original table row 3; O05 |
| Independent delegation and checked pending results | Original table row 4; O06 |
| Useful progress and unconfirmed findings, no arbitrary cadence or false complete coverage | Original table row 5; O08, O15 |
| Actionable code review with file/line/failure evidence | Original table row 6; O15 |
| Requested usable files, respecting an outline request | Original table row 7; O15 |
| Long-document discrepancies located, unresolved contradictions marked | Original table row 8; O15 |
| Context exploration within authorized sources | Original table row 9; O09 |
| Pasted-content authority and tag limits | Original table row 10; O12 |
| Specific frontend constraints and iterative inspection, no universal style bans | Original table row 11; O14 |
| Original visuals, capability checks, cropping and rechecking preprocessing | Original table row 12; O13 |
| Settled follow-ups without disabling long-task correction | Original table row 13; O11 |
| Current-source rechecks, documented claims versus adaptations, GPT-6 not inferred from Opus | Prompt principles introduction and closing guidance |
| Existing runtime summaries: effort/tokens/cache/refusals/progress/switching/fast/time/continuation/wrappers | Original model/harness summary retained; O03–O13, O16 |
| Five original evaluation prompts, outputs, file inputs | `evals/evals.json`, cases 1–5 unchanged |
| Original report fixture and its intentional defects | `evals/fixtures/report-skill.md` unchanged |

## Adaptations and corrections

These preserve source lessons without changing the target skill's authority:

- **Baseline:** No-skill evaluation is retained for new-skill methods.
  Existing-skill tuning still uses the saved old skill for regression comparison.
- **Recovery:** The source's missing-file and permission-error defaults illustrate explicit recovery.
  They do not authorize creating files or hiding unavailable required data.
- **Identity:** Naming recommendations are retained without automatically renaming existing skills.
  Screenshot display names do not override textual frontmatter constraints.
- **Client syntax:** Claude's frontmatter, dependency limits, and MCP example syntax remain conditional.
  Actual client support determines valid controls and identifiers.
- **Interaction:** Unattended continuation remains conditional.
  It cannot replace teaching checkpoints, protected access, or destructive-action approval.
- **Model claims:** Source-reported capability, speed, quality, and cost comparisons remain attributed.
  They do not establish improvements from this repository change.
- **Completeness:** All advice lives in instructions or substantive references.
  Progressive disclosure limits routine context use, not source coverage.

## Maintenance rule

When updating a source-derived recommendation, check its surrounding examples and caveats.
Update its destination and this map together.
Keep duplicate advice consolidated only when its conditions and limits remain.
Do not mark coverage complete while a source section or required safeguard is unresolved.
