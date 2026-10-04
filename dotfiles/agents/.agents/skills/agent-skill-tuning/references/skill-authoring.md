# Skill-authoring practices

Source: [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), checked 2026-10-04.

This reference retains the source's substantive guidance and example patterns.
The numbered sections support the coverage map. They are review lenses, not
instructions to rewrite every target. Apply each lens only to a concrete need.
Claude-specific runtime claims do not establish behavior in other clients.

## Contents

- [A01: Context economy](#a01-context-economy)
- [A02: Degrees of freedom](#a02-degrees-of-freedom)
- [A03: Intended models](#a03-intended-models)
- [A04: Names and frontmatter](#a04-names-and-frontmatter)
- [A05: Discovery descriptions](#a05-discovery-descriptions)
- [A06: Progressive disclosure](#a06-progressive-disclosure)
- [A07: Resource organization](#a07-resource-organization)
- [A08: Reference depth and contents](#a08-reference-depth-and-contents)
- [A09: Sequential and conditional workflows](#a09-sequential-and-conditional-workflows)
- [A10: Feedback loops](#a10-feedback-loops)
- [A11: Stable information and terminology](#a11-stable-information-and-terminology)
- [A12: Templates and examples](#a12-templates-and-examples)
- [A13: Evaluations before extensive instructions](#a13-evaluations-before-extensive-instructions)
- [A14: Iterative development and feedback](#a14-iterative-development-and-feedback)
- [A15: Observe navigation](#a15-observe-navigation)
- [A16: Paths and defaults](#a16-paths-and-defaults)
- [A17: Scripts that solve problems](#a17-scripts-that-solve-problems)
- [A18: Utility scripts](#a18-utility-scripts)
- [A19: Visual analysis](#a19-visual-analysis)
- [A20: Verifiable intermediate outputs](#a20-verifiable-intermediate-outputs)
- [A21: Dependencies and product surfaces](#a21-dependencies-and-product-surfaces)
- [A22: Filesystem runtime](#a22-filesystem-runtime)
- [A23: Qualified MCP tools](#a23-qualified-mcp-tools)
- [A24: Final checklist](#a24-final-checklist)

## A01: Context economy

The context window also holds the system prompt, conversation, other skills'
metadata, and the user's request. Concision matters after a skill loads.
At startup, Claude loads names and descriptions, not every skill body.
It reads `SKILL.md` when relevant and additional files when needed.

Assume the model already knows general concepts. For each explanation, ask:

- Does the model need this information?
- Can the model already know it?
- Does the paragraph justify its token cost?

Keep task-specific facts, constraints, and examples. Remove textbook introductions.
The source contrasts an approximately 50-token PDF extraction example with an
approximately 150-token explanation of PDFs, libraries, and installation.
The lesson is useful specificity, not a universal token quota.

Illustrative concise pattern:

```python
import pdfplumber

with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```

This excerpt demonstrates concision. It does not satisfy an all-pages extraction
contract. Check dependencies and the actual task before adopting example code.

## A02: Degrees of freedom

Match specificity to the operation's fragility and variability.

| Freedom | Suitable conditions | Source example |
| --- | --- | --- |
| High: prose and heuristics | Several approaches work. Context drives decisions. | Review structure, bugs, readability, and project conventions. |
| Medium: pseudocode or parameterized scripts | A preferred pattern exists. Some variation and configuration are useful. | `generate_report(data, format="markdown", include_charts=True)` |
| Low: exact scripts and few parameters | Errors are costly. Consistency or sequence is critical. | `python scripts/migrate.py --verify --backup`, without extra flags. |

The source's narrow-bridge analogy calls for guardrails on dangerous operations.
Its open-field analogy leaves room for judgment when many routes are safe.
Do not prescribe exact commands for exploratory reviews merely for consistency.
Do not replace a fragile migration's sequence with open-ended discretion.

## A03: Intended models

Evaluate every model the skill will support. More powerful models can need less
explanation than smaller models. A shorter instruction is not automatically better.

- **Haiku:** Check whether the instructions give enough guidance.
- **Sonnet:** Check clarity and efficiency.
- **Opus:** Check whether the instructions over-explain.
- **Other models:** Check their actual behavior, not an assumed Claude equivalence.

The source's final checklist names tests on Haiku, Sonnet, and Opus.
For portable skills, report which intended models and clients were actually tested.
Mark missing runs explicitly. Do not infer cross-model gains from an Opus run.

## A04: Names and frontmatter

The source recommends consistent, descriptive names for discussion, discovery,
search, organization, and maintenance. Gerunds describe an activity clearly:
`processing-pdfs`, `analyzing-spreadsheets`, `managing-databases`, `testing-code`,
and `writing-documentation`.

Noun phrases such as `pdf-processing` and action forms such as `process-pdfs`
are also acceptable. Avoid vague names such as `helper`, `utils`, and `tools`.
Avoid generic names such as `documents`, `data`, and `files`.
Avoid inconsistent collection conventions.

Claude's documented frontmatter rules:

- Require exactly one `name` field and one `description` field.
- Limit `name` to 64 characters.
- Use only lowercase letters, numbers, and hyphens in `name`.
- Do not use XML tags or reserved words in `name`.
- The linked overview identifies the reserved words as `anthropic` and `claude`.
- Require a non-empty `description` of at most 1,024 characters.
- Do not use XML tags in `description`.

Check the target client's schema before imposing Claude-specific validation.
Preserve existing skill names and invocation metadata during tuning.
Treat renaming as a separate compatibility change that needs authorization.

## A05: Discovery descriptions

The description explains both the capability and the situations that need it.
Specific terms help selection among potentially more than 100 skills.
The body supplies implementation details, not a substitute for discovery metadata.

| Capability | Useful trigger terms |
| --- | --- |
| Extract PDF text and tables, fill forms, merge documents | PDFs, forms, document extraction |
| Analyze Excel files, pivot tables, charts | Excel, spreadsheets, tabular data, `.xlsx` |
| Generate commit messages from diffs | Commit messages, staged changes |

Avoid descriptions such as “Helps with documents,” “Processes data,” or
“Does stuff with files.” Include what the skill does and when to use it.
Keep deliberate manual invocation. Better metadata does not authorize automatic use.

## A06: Progressive disclosure

Use `SKILL.md` as the overview and route to detailed material when needed.
Keep its body under 500 lines as the source's performance recommendation.
Split material before the overview becomes difficult to navigate.
This is not permission to discard required advice.

Start with one file when enough. Add guides, reference material, examples, scripts,
templates, or data as complexity grows. Unread resources consume no context tokens.
Once read, reference text competes with the rest of the context.
Script execution normally puts only its output into context.

## A07: Resource organization

The source gives three navigation patterns:

1. **Overview with references.** Put a quick start in `SKILL.md`.
   Link form-filling instructions, API methods, and examples directly.
2. **Domain-specific references.** Separate finance, sales, product, and marketing schemas.
   Load only the domain relevant to the request.
3. **Conditional detail.** Route document creation to `DOCX-JS.md`.
   Route tracked changes to `REDLINING.md` and format internals to `OOXML.md`.

The diagrams show YAML metadata plus a Markdown body, then linked references,
then executable scripts. The PDF example counts pages and extracts page text.
Its form guide first checks for fillable fields, then selects the appropriate branch.
The branches distinguish fillable from non-fillable forms.
The advanced reference illustrates a separate pypdfium2 rendering-library guide.
The script diagram extracts fields to JSON and checks command-line arguments.
It prints usage and exits when the argument count is wrong.
These examples connect discovery, conditional guidance, and deterministic execution.

State the working directory for relative commands when it matters.
The screenshots are illustrations, not validated libraries or schema authorities.
For example, their display name `PDF Processing` conflicts with the text's lowercase
name rule. Follow the documented validation rule rather than copying that name.

Use descriptive filenames such as `form_validation_rules.md`, not `doc2.md`.
Organize directories by domain or feature, not arbitrary `file1.md` numbering.

## A08: Reference depth and contents

Link operational references directly from `SKILL.md`. Keep reference depth to one
level. A chain from `SKILL.md` to `advanced.md` to `details.md` can cause partial reads.
A preview such as `head -100` is not evidence of complete coverage.

For references longer than 100 lines, add a table of contents at the top.
Show the complete scope, including setup, methods, advanced features, errors,
and examples. Read the complete applicable sections before using them.

For large domain references, provide focused search examples:

```bash
grep -i "revenue" reference/finance.md
grep -i "pipeline" reference/sales.md
grep -i "api usage" reference/product.md
```

Search locates material. It does not replace the surrounding constraints.

## A09: Sequential and conditional workflows

Break complex work into ordered steps. For long workflows, provide a checklist
that the agent can copy and update. Do not add tracking overhead to trivial work.

The research example uses this sequence:

1. Read all source documents.
2. Identify themes and supporting evidence.
3. Cross-reference claims, agreements, and conflicts.
4. Create a summary with claims, evidence, and conflicting views.
5. Check citations.

If a citation is incomplete, return to the claim check.

The PDF example analyzes fields into `fields.json`, maps values, checks the mapping,
fills the form, and checks the output. Fix mapping errors before filling.
If output checks fail, return to the mapping step.

Use explicit decision points when workflows differ. The document example creates
new files with docx-js, but edits existing files through unpacked XML.
The editing branch checks each change before repacking.

## A10: Feedback loops

Use the loop: check the result, fix errors, then check again.
Do not proceed while a required check fails.

The source provides both code-free and scripted validators:

- **Style guide:** Draft against `STYLE_GUIDE.md`.
  Check terminology, example formats, and required sections.
  Record problems with section references.
  Revise until the checklist passes.
  Save the final document.
- **Document XML:** Edit `word/document.xml`.
  Run the validator immediately.
  Read specific errors.
  Fix the XML.
  Repeat the check before packing.
  Check the rebuilt document.

Manual reference checks are useful when no script exists. Label them as manual.
A structural validator does not establish behavioral correctness.

## A11: Stable information and terminology

Avoid live instructions that branch on calendar dates and become obsolete.
Describe the current method. Keep historical methods in an “Old patterns” section
or a collapsed legacy section when useful.
The source's example identifies a deprecated v1 API separately from the current v2 API.

Use one term for one meaning. The examples keep “API endpoint,” “field,” and
“extract” consistent instead of alternating with route, box, or pull.
Do not collapse technically distinct concepts merely to simplify vocabulary.
Dates that record source checks or deprecation evidence remain useful.

## A12: Templates and examples

Match template strictness to the output contract.
Use an exact structure for API responses or required data formats.
Use a flexible default when the task benefits from judgment.
The report example includes a title, executive summary, findings with evidence,
and actionable recommendations. Flexible versions allow appropriate section changes.

Provide concrete input/output pairs when style or detail is difficult to describe.
The source's commit examples show:

| Input | Output pattern and detail |
| --- | --- |
| Add JWT authentication | `feat(auth): implement JWT-based authentication`, then login and middleware details |
| Fix report dates | `fix(reports): correct date formatting in timezone conversion`, then UTC handling |
| Update dependencies and error handling | `chore: update dependencies and refactor error handling`, then dependency and error-format bullets |

The pattern is `type(scope): brief description`, followed by useful detail.
Examples communicate both style and specificity. Do not make their incidental
library versions, dates, or subject matter universal requirements.

## A13: Evaluations before extensive instructions

Build evaluations before adding extensive documentation.
Address observed failures, not imagined differences from a checklist.

1. Identify gaps on representative tasks.
2. Create at least three scenarios for those gaps.
3. Establish the baseline.
4. Add minimal instructions that address the gaps.
5. Run the evaluations.
6. Compare results with the baseline.
7. Refine the instructions.

For new skills, the source uses a no-skill baseline.
For this tuning workflow, use the saved old skill as the primary baseline.
A no-skill comparison can also show whether the skill adds value.

An evaluation needs the skill, query, input files, and observable expected behavior.
The source's PDF example checks the reading tool, extraction from every page,
and a readable `output.txt`. A representative schema is:

```json
{
  "skills": ["pdf-processing"],
  "query": "Extract all PDF text and save it to output.txt",
  "files": ["test-files/document.pdf"],
  "expected_behavior": [
    "Uses an appropriate PDF tool",
    "Extracts every page",
    "Saves readable output.txt"
  ]
}
```

This is a source example, not a universal evaluation-runner schema.
Use the repository's actual schema for its evaluations.

## A14: Iterative development and feedback

Separate the refining agent, “Claude A,” from the fresh using agent, “Claude B.”
The user supplies domain expertise. Real usage reveals gaps.

For new-skill design, the source recommends completing a real task first.
Capture repeatedly supplied facts, schemas, names, filtering rules, and query patterns.
Then remove generic explanation, separate references, and evaluate related tasks
with a fresh agent. For example, retain “exclude test accounts” and Q4 date filtering.
Do not expand this tuning skill into unauthorized new-skill creation.

For existing skills, repeat this cycle:

1. Give the using agent real tasks.
2. Observe failures, successes, and unexpected choices.
3. Share the current skill and concrete observations with the refining agent.
4. Review proposed changes.
5. Apply authorized changes.
6. Evaluate similar requests again.

A missed rule can need more prominence, better structure, or clearer requirement wording.
Stronger wording is one option, not an automatic reason to add “MUST” everywhere.
Share with teammates when applicable. Ask about activation, clarity, and missing guidance.
Incorporate observed feedback rather than inventing team approval.

## A15: Observe navigation

Inspect how the agent actually finds and uses resources:

- Unexpected read order can indicate unclear organization.
- Missed references can need more explicit or prominent links.
- Repeated reads can indicate material belongs in the main workflow.
- Ignored files can be unnecessary or poorly signaled.

Recheck `name` and `description` when expected discovery fails.
For manual skills, check discoverability and explicit invocation without enabling automatic use.
Do not delete an ignored resource before checking whether routing caused the omission.

## A16: Paths and defaults

Use forward slashes even on Windows: `scripts/helper.py`, not backslash paths.
Give a sensible default instead of an unnecessary menu of tools.
Include a clear escape condition when another approach is necessary.
The source defaults to pdfplumber for text extraction, with pdf2image and pytesseract
for scanned PDFs that need OCR.

## A17: Scripts that solve problems

Handle expected errors explicitly. Do not leave all recovery to the model.
Give actionable messages when recovery is unsafe or impossible.
Document configurable values and their reasons. Avoid unexplained “voodoo constants.”

The source illustrates a 30-second request timeout for slow connections and three
retries for transient failures. These are explained examples, not required defaults.
Its contrasting values, `47` and `5`, lack a reason.

The source's file example creates an empty missing file or returns an empty default after
a permission error. Adopt such recovery only when the target contract permits it.
Do not bypass permissions, erase evidence, create unauthorized files, or label missing
data as success. This safety qualification preserves this skill's existing boundaries.

## A18: Utility scripts

Prefer tested bundled scripts for deterministic, repeated operations.
They avoid repeated code generation, reduce context use, save time, and improve consistency.
Check those benefits on the actual workflow before claiming a measured gain.

Distinguish execution from reading:

- **Execute:** “Run `analyze_form.py` to extract fields.”
- **Read:** “Read `analyze_form.py` for the field-extraction algorithm.”

Document the command, inputs, outputs, dependencies, and errors.
The source analyzes forms into JSON with field type and coordinates, checks bounding-box
overlaps with `OK` or conflict details, then fills the PDF.
A signature field can have `"type": "sig"`, `"x": 150`, and `"y": 500`.
Exact types and coordinates depend on the supplied script and form.

## A19: Visual analysis

If layout matters and visual tools exist, render the input into images.
The source converts a PDF into page images, then identifies field positions and types.
Inspect each required page. Do not assume visual access or replace available original
data with an unsupported visual guess.

## A20: Verifiable intermediate outputs

For batch, destructive, high-stakes, or complex changes, use a structured plan before execution.
The sequence is analyze, create the plan, check it, execute, then check the result.
Keep originals unchanged while correcting the plan.

The source's 50-field PDF example uses `changes.json`.
Checks catch nonexistent fields, conflicting values, missed required fields, and incorrect updates.
Machine checks make failures reproducible and help debugging before changes occur.

Give specific errors with available alternatives, for example:

```text
Field 'signature_date' not found.
Available fields: customer_name, order_total, signature_date_signed
```

A passed plan check does not replace required user approval for execution.

## A21: Dependencies and product surfaces

List required packages in the skill. Check actual availability before use.
Do not assume a PDF library or other tool is installed.
Document installation only for clients that support it and authorize it.
The source shows `pip install pypdf` before a `PdfReader` example.

The source distinguishes these documented Claude surfaces:

- **claude.ai:** Can install npm and PyPI packages and pull GitHub repositories,
  subject to the actual environment and network policy.
- **Claude API skill container:** No network access or runtime package installation.
  Required packages must already be available.
- **Other clients:** Check their tools, network policy, permissions, and dependency setup separately.

Check the [code execution documentation](https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool)
for available packages and supported execution behavior. Do not run an installation
merely because a source example includes it.

## A22: Filesystem runtime

The documented Claude architecture provides files, Bash, and code execution.
Metadata loads first, instruction files load on demand, and scripts execute through tools.
Only a script's returned output normally enters context, not its full implementation.
Large references, datasets, and API documentation have no context cost until read.

Bundle complete resources when useful. Organize them by domain or feature.
Use deterministic scripts instead of repeated model-generated validation code.
State whether a script is executed or read as reference.
Evaluate file access with real requests.
In the BigQuery example, a revenue request loads the finance reference, not sales or product.
Do not assume another harness exposes the same filesystem or execution tools.

## A23: Qualified MCP tools

Use fully qualified tool names to avoid ambiguous discovery and “tool not found” errors.
The source's format is `ServerName:tool_name`:

```text
BigQuery:bigquery_schema
GitHub:create_issue
```

`BigQuery` and `GitHub` are servers. The parts after the colon are tools.
Check the actual exposed names in the target client. Some clients encode qualification
in another form. Do not rewrite a working tool identifier into unsupported syntax.
Qualification does not authorize an external side effect.

## A24: Final checklist

Core quality:

- [ ] The description states the capability, trigger contexts, and specific terms.
- [ ] The main body stays under 500 lines, with detail in linked references.
- [ ] References are one level deep and use progressive disclosure.
- [ ] Long references have contents lists.
- [ ] Workflows have clear steps and concrete examples.
- [ ] Terminology is consistent.
- [ ] Obsolete guidance is absent or isolated as an old pattern.

Code and scripts, when applicable:

- [ ] Scripts handle expected errors rather than deferring all recovery.
- [ ] Errors are explicit and helpful.
- [ ] Configurable values have documented reasons.
- [ ] Required packages are listed and checked as available.
- [ ] Script documentation states execution intent, arguments, and outputs.
- [ ] Paths use forward slashes.
- [ ] Critical operations have checks and feedback loops.
- [ ] High-stakes changes have a checked intermediate plan and required approval.

Evaluation:

- [ ] At least three gap-based evaluations exist.
- [ ] Intended models are evaluated, including Haiku, Sonnet, and Opus when supported.
- [ ] Real workflows and resource navigation are checked.
- [ ] Team feedback is included when available and applicable.
- [ ] Missing runs and unconfirmed claims are identified.

The source's next steps route to the Skills quickstart, Claude Code skills, and API
skills guides. Use the relevant client documentation before installation or deployment.
Do not change clients or deploy skills as a side effect of a tuning request.
