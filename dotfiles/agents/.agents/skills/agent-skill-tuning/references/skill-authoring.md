# Skill-authoring practices

Source: [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), checked 2026-10-04.

This reference preserves source guidance and examples.
Sections A01–A24 support the coverage map.
Apply sections only to concrete needs.
Not every target needs changes.
Source examples and limits do not establish behavior in every client.

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
- [A20: Checked intermediate outputs](#a20-checked-intermediate-outputs)
- [A21: Dependencies and client capabilities](#a21-dependencies-and-client-capabilities)
- [A22: File access and execution](#a22-file-access-and-execution)
- [A23: Qualified MCP tools](#a23-qualified-mcp-tools)
- [A24: Final checklist](#a24-final-checklist)

## A01: Context economy

Context can include the system prompt, conversation, skill metadata, and user request.
Loaded skills also consume context.

Before you rely on progressive disclosure, check the client's loading behavior ([A22](#a22-file-access-and-execution)).
If the task or observed behavior requires basic explanations, keep them.
For each explanation, ask:

- Does the model need it?
- Does the model already know it?
- Does it justify its token cost?

Keep task-specific facts, constraints, and examples.
Remove textbook introductions.
The source contrasts an approximately 50-token PDF extraction example with approximately 150-token explanations of PDFs, libraries, and installation.
This contrast favors specificity, not a universal token quota.

Illustrative concise pattern:

```python
import pdfplumber

with pdfplumber.open("file.pdf") as pdf:
    text = pdf.pages[0].extract_text()
```

This concise excerpt does not satisfy an all-pages extraction contract.
Before you adopt example code, check its dependencies against the task.

## A02: Degrees of freedom

Match specificity to the operation's fragility and variability.

| Freedom | Suitable conditions | Source example |
| --- | --- | --- |
| High: prose and heuristics | Several approaches work. Context drives decisions. | Check structure, bugs, readability, and project conventions. |
| Medium: pseudocode or parameterized scripts | A preferred pattern exists. Some variation and configuration are useful. | `generate_report(data, format="markdown", include_charts=True)` |
| Low: exact scripts and few parameters | Errors are costly. Consistency or sequence is critical. | `python scripts/migrate.py --verify --backup`, without extra flags. |

The source contrasts a narrow bridge (guardrails for dangerous operations) with an open field (judgment among safe routes).
For exploratory reviews, do not impose exact commands merely for consistency.
For fragile migrations, do not replace required sequences with open-ended discretion.

## A03: Intended models

Useful detail depends on observed behavior, not model names or sizes.
Shorter instructions are not automatically better.

Evaluate every intended model and client for sufficient guidance, clarity, efficiency, over-explanation, and actual capabilities.
Do not assume equivalent capabilities.

For portable skills, report covered models, clients, and missing runs explicitly.
Do not infer cross-model or cross-client gains from one configuration.

## A04: Names and frontmatter

Consistent, descriptive names aid discussion, discovery, search, organization, and maintenance.
Gerunds describe activities:
`processing-pdfs`, `analyzing-spreadsheets`, `managing-databases`, `testing-code`,
and `writing-documentation`.

Noun phrases such as `pdf-processing` and action forms such as `process-pdfs` also work.
Avoid vague names (`helper`, `utils`, `tools`) and generic names (`documents`, `data`, `files`).
Keep collection conventions consistent.

If the client requires frontmatter, check its schema.
These source constraints apply to its client, not universally:

- The frontmatter has exactly one `name` field and one `description` field.
- The `name` field contains at most 64 characters.
- The `name` field uses only lowercase letters, numbers, and hyphens.
- The `name` field excludes XML tags and client-reserved words.
- The `description` field is non-empty and contains at most 1,024 characters.
- The `description` field excludes XML tags.

Preserve existing names and invocation metadata during tuning.
Get authorization for renaming as a separate compatibility change.

## A05: Discovery descriptions

Descriptions state capabilities and use cases.
Specific terms aid selection among potentially more than 100 skills.
Body details cannot replace discovery metadata.

| Capability | Useful trigger terms |
| --- | --- |
| Extract PDF text and tables, fill forms, merge documents | PDFs, forms, document extraction |
| Analyze Excel files, pivot tables, charts | Excel, spreadsheets, tabular data, `.xlsx` |
| Generate commit messages from diffs | Commit messages, staged changes |

Avoid descriptions such as “Helps with documents,” “Processes data,” or
“Does stuff with files.”
Preserve deliberate manual invocation.
Better metadata does not authorize automatic use.

## A06: Progressive disclosure

Use `SKILL.md` for an overview with links to detailed material.

The source's recommendation of fewer than 500 body lines in `SKILL.md` is a review threshold, not a universal limit.

Before navigation becomes difficult, split details into linked resources.
Do not discard required advice to meet length recommendations.
If one file suffices, start there.
As complexity grows, add guides, references, examples, scripts, templates, or data.

For context-loading conditions, see [A22](#a22-file-access-and-execution).

## A07: Resource organization

The source gives three navigation patterns:

| Pattern | Structure |
| --- | --- |
| Overview with references | `SKILL.md` contains a quick start and direct links to form-filling instructions, API methods, and examples. |
| Domain-specific references | Separate finance, sales, product, and marketing schemas let the agent load only the relevant domain. |
| Conditional detail | Document creation uses `DOCX-JS.md`, tracked changes use `REDLINING.md`, and format internals use `OOXML.md`. |

The diagrams connect YAML metadata and a Markdown body with linked references and executable scripts.
The PDF example counts pages and extracts page text.
The form guide checks for fillable fields, then branches for fillable or non-fillable forms.
A separate advanced reference covers the pypdfium2 rendering library.

The script extracts fields to JSON and checks command-line arguments.
If the argument count is wrong, it prints usage and exits.

For location-dependent relative commands, state the working directory.
Screenshots illustrate patterns, not checked libraries or authoritative schemas.
Their display name `PDF Processing` conflicts with the source's lowercase name rule.
If the client requires lowercase names, do not copy `PDF Processing` into `name`.

Use descriptive filenames such as `form_validation_rules.md`, not `doc2.md`.
Organize directories by domain or feature, not arbitrary `file1.md` numbering.

## A08: Reference depth and contents

Keep operational references one link from `SKILL.md`.
A chain from `SKILL.md` to `advanced.md` to `details.md` risks partial reads.
A `head -100` preview does not prove complete coverage.

For references longer than 100 lines, add a table of contents at the top.
Show the complete scope: setup, methods, advanced features, errors, and examples.
Before use, read the complete applicable sections.

For large domain references, provide focused search examples:

```bash
grep -i "revenue" reference/finance.md
grep -i "pipeline" reference/sales.md
grep -i "api usage" reference/product.md
```

Search does not replace surrounding constraints.

## A09: Sequential and conditional workflows

Use ordered steps for complex work.
For long workflows, provide a checklist that the agent can copy and update.
Do not add tracking overhead to trivial work.

The research example uses this sequence:

1. Read all source documents.
2. Identify themes and supporting evidence.
3. Cross-reference claims, agreements, and conflicts.
4. Create a summary with claims, evidence, and conflicting views.
5. Check citations.

If a citation is incomplete, return to the claim check.

The PDF example uses this sequence:

1. Analyze fields into `fields.json`.
2. Map the values.
3. Check the mapping.
4. Fix mapping errors.
5. Fill the form.
6. Check the output.

If output checks fail, return to the mapping step.

If workflows differ, use explicit decision points.
The document example uses docx-js for creation and unpacked XML for edits.
The editing branch checks each change before it repacks the files.

## A10: Feedback loops

Use this feedback loop:

1. Check the result.
2. Fix errors.
3. Check the result again.

If a required check fails, do not proceed.

The source includes code-free and scripted checks.

**Style guide:**

1. Draft against `STYLE_GUIDE.md`.
2. Check terminology, example formats, and required sections.
3. Record problems with section references.
4. If the checklist fails, revise the document.
5. Save the final document.

**Document XML:**

1. Edit `word/document.xml`.
2. Run the XML check immediately.
3. Read specific errors.
4. Fix the XML.
5. Before you pack the files, repeat the check.
6. Check the rebuilt document.

If no script exists, use manual reference checks.
Label manual checks explicitly.
A structural check does not establish behavioral correctness.

Local evaluation follow-up:
For target skills with protected inputs, require a final check that those inputs remain unchanged.

## A11: Stable information and terminology

Describe current methods without calendar-date branches that become obsolete.
If historical methods remain useful, isolate them in “Old patterns” or a collapsed legacy section.
The source separates deprecated v1 and current v2 APIs.

Use one term per meaning.
The examples use “API endpoint,” “field,” and “extract,” not route, box, or pull.
Do not merge distinct technical concepts to simplify vocabulary.
Dates for source checks or deprecation evidence remain useful.

## A12: Templates and examples

Match template strictness to the output contract.
Use exact structures for API responses or required data formats.
If the task benefits from judgment, use a flexible default.
The source's report example includes a title, executive summary, findings with evidence, and actionable recommendations.
Flexible versions permit suitable section changes.

Local evaluation follow-up:
For incomplete inputs, define permitted partial outputs and conditions that require a stop.

If style or detail is difficult to describe, provide concrete input/output pairs.
The source's commit examples show:

| Input | Output pattern and detail |
| --- | --- |
| Add JWT authentication | `feat(auth): implement JWT-based authentication`, then login and middleware details |
| Fix report dates | `fix(reports): correct date formatting in timezone conversion`, then UTC handling |
| Update dependencies and error handling | `chore: update dependencies and refactor error handling`, then dependency and error-format bullets |

The pattern is `type(scope): brief description`, followed by useful detail.
Examples show style and specificity.
Do not treat incidental library versions, dates, or subject matter as universal requirements.

## A13: Evaluations before extensive instructions

Before you add extensive documentation, build evaluations.
Address observed failures, not imagined differences from a checklist.

1. Identify gaps on representative tasks.
2. Create at least three scenarios for those gaps.
3. Establish the baseline.
4. Add minimal instructions that address the gaps.
5. Run the evaluations.
6. Compare results with the baseline.
7. Refine the instructions.

For new skills, the source uses a no-skill baseline.
For existing-skill tuning, use the saved old skill as the primary baseline.
A no-skill comparison can also show added value.

An evaluation specifies the skill, query, input files, and observable expected behavior.
The PDF example checks the reading tool, extraction from every page, and a readable `output.txt`.
Example schema:

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

This source example is not a universal evaluation-runner schema.
Use the repository's actual evaluation schema.

## A14: Iterative development and feedback

Separate the refining agent from the fresh agent that uses the skill.
The user supplies domain expertise.
Real usage reveals gaps.
The source recommends that new-skill authors complete a real task first.

Capture repeated facts, schemas, names, filtering rules, and query patterns.
Apply [A01](#a01-context-economy) and [A06](#a06-progressive-disclosure) to generic explanations and reference material.
Evaluate related tasks with a fresh agent.
For example, retain “exclude test accounts” and Q4 date filtering.
Do not expand this tuning skill into unauthorized new-skill creation.

For existing skills, repeat this cycle:

1. Give the fresh agent real tasks.
2. Observe failures, successes, and unexpected choices.
3. Share the current skill and concrete observations with the refining agent.
4. Check proposed changes.
5. Apply authorized changes.
6. Evaluate similar requests again.

A missed rule can need prominence, structure, or clearer requirements.
Stronger wording can help, but “MUST” everywhere is not an automatic solution.
If team feedback is applicable, share the skill with teammates.
Ask about activation, clarity, and missing guidance.
Incorporate observed feedback.
Do not invent team approval.

## A15: Observe navigation

Check actual resource navigation:

- Unexpected read order can indicate unclear organization.
- Missed references can need clearer or more prominent links.
- Repeated reads can indicate material belongs in the main workflow.
- Ignored files can be unnecessary or poorly signaled.

If discovery fails, check `name` and `description`.
For manual skills, check discoverability and explicit invocation under [A05](#a05-discovery-descriptions).
Before you delete an ignored resource, check whether routing caused the omission.

## A16: Paths and defaults

Use forward-slash paths, even on Windows: `scripts/helper.py`.
Give a sensible default, not an unnecessary tool menu.
For alternatives, state the condition for replacing the default.
The source defaults to pdfplumber for text extraction and pdf2image with pytesseract for scanned-PDF OCR.

## A17: Scripts that solve problems

Handle expected errors explicitly.
Do not leave all recovery to the model.
If recovery is unsafe or impossible, give actionable messages.
Document configuration values and their reasons, not unexplained “voodoo constants.”

Source examples explain a 30-second request timeout for slow connections and three retries for transient failures.
These are examples, not required defaults.
In contrast, `47` and `5` lack reasons.

If a requested file is missing, the source example creates an empty file.
After a permission error, it returns an empty default.

If the target contract permits this recovery, use it.
Do not bypass permissions.
Do not erase evidence.
Do not create unauthorized files.
Do not label missing data as success.

## A18: Utility scripts

For deterministic, repeated operations, prefer checked bundled scripts.
Bundled scripts can avoid repeated code generation, reduce context use, save time, and improve consistency.
Before you claim measured gains, check these benefits on the actual workflow.

Distinguish execution from reading:

- **Execute:** “Run `analyze_form.py` to extract fields.”
- **Read:** “Read `analyze_form.py` for the field-extraction algorithm.”

Document the command, inputs, outputs, dependencies, and errors.
The source extracts form fields to JSON, including types and coordinates.
Bounding-box overlap checks return `OK` or conflict details before the script fills the PDF.
A signature field can have `"type": "sig"`, `"x": 150`, and `"y": 500`.
Exact types and coordinates depend on the supplied script and form.

## A19: Visual analysis

If layout matters and visual tools exist, render the input into images.
The source converts a PDF into page images, then identifies field positions and types.
Check each required page.
Do not assume visual access.
Do not replace available original data with an unsupported visual guess.

## A20: Checked intermediate outputs

Before batch, destructive, high-stakes, or complex changes, use this sequence:

1. Analyze the requested changes.
2. Create a structured plan.
3. Check the plan.
4. Get required user approval.
5. Execute the plan.
6. Check the result.

While you correct the plan, keep originals unchanged.

The source's 50-field PDF plan uses `changes.json`.
Checks catch nonexistent fields, conflicting values, missed required fields, and incorrect updates.
Machine checks make failures reproducible and help debugging before changes.

Give specific errors with available alternatives:

```text
Field 'signature_date' not found.
Available fields: customer_name, order_total, signature_date_signed
```

A passed plan check does not replace required user approval for execution.

## A21: Dependencies and client capabilities

List required packages in the skill.
Before use, check package availability.
The source shows `pip install pypdf` before a `PdfReader` example.
Dependency examples include npm and PyPI packages or GitHub repositories.

Before you select dependencies, check the client's capabilities and policy:

- Check the available tools and packages.
- Check whether network access is available and permitted.
- Check whether package installation is available and permitted.
- Check repository access and permissions.
- Check whether dependencies must be supplied before execution.

If network access or installation is unavailable, check whether available dependencies satisfy the task.
If they satisfy the task, use them.
If they cannot satisfy the task, report the missing requirement.

If the client supports installation and the user authorizes it, document the procedure.
Before you install a package, get any required approval.
Check client documentation for supported execution behavior.
Do not install a package merely because a source example does.

## A22: File access and execution

Before use, check client support for file access, shell tools, code execution, metadata-first discovery, and on-demand resource reads.
If the client supports metadata-first discovery, keep names and descriptions sufficient for selection.
If the client supports on-demand file reads, link resources for the relevant task.
If the client exposes Bash or another shell, document compatible commands.
If the client supports script execution, document the supported command and working directory.
Check which script inputs and results enter context.

If the client loads resources only on demand, unread references, datasets, and API documentation remain outside context.
Loaded references compete with other context.
If a tool returns only script output, the implementation does not enter context through that result.

If complete resources help the task, bundle them by domain or feature ([A07](#a07-resource-organization)).
If script execution is available, use deterministic scripts for repeated checks.
For execution-versus-reference intent, use [A18](#a18-utility-scripts).
Evaluate file access with real requests.

In the BigQuery example, revenue requests load finance references, not sales or product.
Do not assume clients expose identical filesystems or execution tools.

## A23: Qualified MCP tools

If the client supports tool qualification, use its exposed names.
Qualification can prevent ambiguous discovery and “tool not found” errors.
The source uses `ServerName:tool_name`:

```text
BigQuery:bigquery_schema
GitHub:create_issue
```

`BigQuery` and `GitHub` are servers.
The suffixes after the colon are tools.
Check the actual exposed names in the target client.
Clients can encode qualification differently.
Do not replace working tool identifiers with unsupported syntax.
Qualification does not authorize external side effects.

## A24: Final checklist

Complete every applicable check in the linked sections.

Core quality:

- [ ] Check task-specific context and instruction freedom ([A01](#a01-context-economy), [A02](#a02-degrees-of-freedom)).
- [ ] Check frontmatter and discovery ([A04](#a04-names-and-frontmatter), [A05](#a05-discovery-descriptions)).
- [ ] Check descriptive filenames, domain organization, paths, and defaults with conditional fallbacks ([A07](#a07-resource-organization), [A16](#a16-paths-and-defaults)).
- [ ] Check length, disclosure, links, contents, and loading behavior ([A06](#a06-progressive-disclosure), [A08](#a08-reference-depth-and-contents), [A22](#a22-file-access-and-execution)).
- [ ] Check workflows, terminology, historical patterns, and examples ([A09](#a09-sequential-and-conditional-workflows), [A11](#a11-stable-information-and-terminology), [A12](#a12-templates-and-examples)).

For skills with code or scripts:

- [ ] Check error handling and configuration ([A17](#a17-scripts-that-solve-problems)).
- [ ] Check packages, availability, policy, and approvals ([A21](#a21-dependencies-and-client-capabilities)).
- [ ] Check script documentation and paths ([A18](#a18-utility-scripts), [A16](#a16-paths-and-defaults)).
- [ ] Check critical-operation feedback loops and intermediate plans with required approval ([A10](#a10-feedback-loops), [A20](#a20-checked-intermediate-outputs)).

Evaluation:

- [ ] Check gap-based scenarios and baseline comparisons ([A13](#a13-evaluations-before-extensive-instructions)).
- [ ] Check model/client coverage and missing-run reporting ([A03](#a03-intended-models)).
- [ ] Check real workflows, applicable team feedback, and navigation ([A14](#a14-iterative-development-and-feedback), [A15](#a15-observe-navigation)).
- [ ] Identify unchecked claims in the report.

Before installation or deployment, check the relevant client documentation.
Do not change clients as a side effect of a tuning request.
Do not deploy skills as a side effect of a tuning request.
