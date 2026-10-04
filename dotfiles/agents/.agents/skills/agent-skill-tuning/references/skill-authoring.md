# Skill-authoring practices

Source: [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), checked 2026-10-04.

This reference retains the source's substantive guidance and example patterns.
The numbered sections support the coverage map.
They guide reviews without requiring changes to every target.
Apply each section only to a concrete need.
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

The context window can contain the system prompt, conversation, skill metadata, and the user's request.
Concision matters after a skill loads.
Clients differ in which skill resources they load into context.

Before you rely on progressive disclosure, check the target client's loading behavior.
If the task or observed behavior requires basic explanations, keep them.
For each explanation, ask:

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

This excerpt demonstrates concision.
It does not satisfy an all-pages extraction contract.
Before you adopt example code, check dependencies against the actual task.

## A02: Degrees of freedom

Match specificity to the operation's fragility and variability.

| Freedom | Suitable conditions | Source example |
| --- | --- | --- |
| High: prose and heuristics | Several approaches work. Context drives decisions. | Check structure, bugs, readability, and project conventions. |
| Medium: pseudocode or parameterized scripts | A preferred pattern exists. Some variation and configuration are useful. | `generate_report(data, format="markdown", include_charts=True)` |
| Low: exact scripts and few parameters | Errors are costly. Consistency or sequence is critical. | `python scripts/migrate.py --verify --backup`, without extra flags. |

The source's narrow-bridge analogy calls for guardrails on dangerous operations.
When many routes are safe, its open-field analogy leaves room for judgment.
Do not prescribe exact commands for exploratory reviews merely for consistency.
Do not replace a fragile migration's sequence with open-ended discretion.

## A03: Intended models

Evaluate every model and client that the skill will support.
The amount of useful explanation depends on observed behavior, not a model's name or size.
A shorter instruction is not automatically better.

- Check whether the instructions give enough guidance.
- Check clarity and efficiency.
- Check whether the instructions over-explain.
- Check actual behavior rather than assuming equivalent capabilities.

For portable skills, report which intended models and clients the evaluations cover.
Mark missing runs explicitly.
Do not infer gains across models or clients from a single configuration.

## A04: Names and frontmatter

The source recommends consistent, descriptive names for discussion, discovery,
search, organization, and maintenance. Gerunds describe an activity clearly:
`processing-pdfs`, `analyzing-spreadsheets`, `managing-databases`, `testing-code`,
and `writing-documentation`.

Noun phrases such as `pdf-processing` and action forms such as `process-pdfs`
are also acceptable. Avoid vague names such as `helper`, `utils`, and `tools`.
Avoid generic names such as `documents`, `data`, and `files`.
Avoid inconsistent collection conventions.

If the target client requires frontmatter, check its schema.
The source gives these constraints for its supported client, not as universal rules:

- The frontmatter has exactly one `name` field and one `description` field.
- The `name` field contains at most 64 characters.
- The `name` field uses only lowercase letters, numbers, and hyphens.
- The `name` field excludes XML tags and client-reserved words.
- The `description` field is non-empty and contains at most 1,024 characters.
- The `description` field excludes XML tags.

Before you impose these constraints, check the target client's requirements.
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
“Does stuff with files.”
Include the skill's capability and intended use in its description.
Keep deliberate manual invocation. Better metadata does not authorize automatic use.

## A06: Progressive disclosure

Use `SKILL.md` as the overview.
Link detailed material from that overview.

The source recommends a `SKILL.md` body with fewer than 500 lines.
This recommendation is a review threshold, not a universal limit.

Before the overview becomes difficult to navigate, split detailed material into linked resources.
Do not discard required advice to meet a length recommendation.
If one file is sufficient, start with one file.
As complexity grows, add guides, reference material, examples, scripts, templates, or data.

If a client loads resource text only on demand, unread text does not enter the model's context.
Once loaded, reference text competes with the rest of the context.
If a tool returns only script output, the implementation does not enter context through that result.

## A07: Resource organization

The source gives three navigation patterns:

1. **Overview with references.** Put a quick start in `SKILL.md`.
   Link form-filling instructions, API methods, and examples directly.
2. **Domain-specific references.** Separate finance, sales, product, and marketing schemas.
   Load only the domain relevant to the request.
3. **Conditional detail.** Route document creation to `DOCX-JS.md`.
   Route tracked changes to `REDLINING.md`.
   Route format internals to `OOXML.md`.

The diagrams show YAML metadata and a Markdown body.
They also show linked references and executable scripts.
The PDF example counts pages and extracts page text.
Its form guide checks for fillable fields before it selects a branch.
The branches distinguish fillable from non-fillable forms.
The advanced reference illustrates a separate pypdfium2 rendering-library guide.

The script diagram extracts fields to JSON and checks command-line arguments.
If the argument count is wrong, the script prints usage and exits.
These examples connect discovery, conditional guidance, and deterministic execution.

For relative commands that depend on location, state the working directory.
The screenshots illustrate patterns, not checked libraries or authoritative schemas.
Their display name `PDF Processing` differs from the source's lowercase name rule.
If the client requires lowercase names, do not copy `PDF Processing` into `name`.

Use descriptive filenames such as `form_validation_rules.md`, not `doc2.md`.
Organize directories by domain or feature, not arbitrary `file1.md` numbering.

## A08: Reference depth and contents

Link operational references directly from `SKILL.md`.
Keep reference depth to one level.
A chain from `SKILL.md` to `advanced.md` to `details.md` can cause partial reads.
A preview such as `head -100` is not evidence of complete coverage.

For references longer than 100 lines, add a table of contents at the top.
Show the complete scope, including setup, methods, advanced features, errors,
and examples.
Before you use reference material, read the complete applicable sections.

For large domain references, provide focused search examples:

```bash
grep -i "revenue" reference/finance.md
grep -i "pipeline" reference/sales.md
grep -i "api usage" reference/product.md
```

Search locates material. It does not replace the surrounding constraints.

## A09: Sequential and conditional workflows

Break complex work into ordered steps.
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
The document example creates new files with docx-js.
It edits existing files through unpacked XML.
The editing branch checks each change before it repacks the files.

## A10: Feedback loops

Use this feedback loop:

1. Check the result.
2. Fix errors.
3. Check the result again.

If a required check fails, do not proceed.

The source provides both code-free and scripted checks:

- **Style guide:** Draft against `STYLE_GUIDE.md`.
  Check terminology, example formats, and required sections.
  Record problems with section references.
  If the checklist fails, revise the document.
  Save the final document.
- **Document XML:** Edit `word/document.xml`.
  Run the XML check immediately.
  Read specific errors.
  Fix the XML.
  Before you pack the files, repeat the check.
  Check the rebuilt document.

If no script exists, use manual reference checks.
Label manual checks explicitly.
A structural check does not establish behavioral correctness.

## A11: Stable information and terminology

Avoid live instructions that branch on calendar dates and become obsolete.
Describe the current method.
If historical methods remain useful, keep them in an “Old patterns” section or a collapsed legacy section.
The source's example identifies a deprecated v1 API separately from the current v2 API.

Use one term for one meaning. The examples keep “API endpoint,” “field,” and
“extract” consistent instead of alternating with route, box, or pull.
Do not collapse technically distinct concepts merely to simplify vocabulary.
Dates that record source checks or deprecation evidence remain useful.

## A12: Templates and examples

Match template strictness to the output contract.
Use an exact structure for API responses or required data formats.
If the task benefits from judgment, use a flexible default.
The report example includes a title, executive summary, findings with evidence,
and actionable recommendations. Flexible versions allow appropriate section changes.

If style or detail is difficult to describe, provide concrete input/output pairs.
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

Separate the refining agent from the fresh agent that uses the skill.
The user supplies domain expertise. Real usage reveals gaps.

The source recommends that new-skill authors complete a real task first.

Capture repeatedly supplied facts, schemas, names, filtering rules, and query patterns.
Remove generic explanation.
Separate reference material.
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

A missed rule can need more prominence, better structure, or clearer requirement wording.
Stronger wording is one option, not an automatic reason to add “MUST” everywhere.
If team feedback is applicable, share the skill with teammates.
Ask about activation, clarity, and missing guidance.
Incorporate observed feedback.
Do not invent team approval.

## A15: Observe navigation

Check how the agent actually finds and uses resources:

- Unexpected read order can indicate unclear organization.
- Missed references can need more explicit or prominent links.
- Repeated reads can indicate material belongs in the main workflow.
- Ignored files can be unnecessary or poorly signaled.

If expected discovery fails, check `name` and `description`.
For manual skills, check discoverability and explicit invocation.
Do not enable automatic use for manual skills.
Before you delete an ignored resource, check whether routing caused the omission.

## A16: Paths and defaults

Use forward slashes even on Windows: `scripts/helper.py`, not backslash paths.
Give a sensible default instead of an unnecessary menu of tools.
For cases that need another approach, include a clear condition for changing the default.
The source defaults to pdfplumber for text extraction, with pdf2image and pytesseract
for scanned PDFs that need OCR.

## A17: Scripts that solve problems

Handle expected errors explicitly.
Do not leave all recovery to the model.
If recovery is unsafe or impossible, give actionable messages.
Document configuration values and their reasons.
Avoid unexplained “voodoo constants.”

The source illustrates a 30-second request timeout for slow connections and three
retries for transient failures. These are explained examples, not required defaults.
Its contrasting values, `47` and `5`, lack a reason.

If the requested file is missing, the source's example creates an empty file.
After a permission error, the example returns an empty default.

If the target contract permits this recovery, use it.
Do not bypass permissions.
Do not erase evidence.
Do not create unauthorized files.
Do not label missing data as success.

## A18: Utility scripts

Prefer checked bundled scripts for deterministic, repeated operations.
Bundled scripts can avoid repeated code generation, reduce context use, save time, and improve consistency.
Before you claim a measured gain, check those benefits on the actual workflow.

Distinguish execution from reading:

- **Execute:** “Run `analyze_form.py` to extract fields.”
- **Read:** “Read `analyze_form.py` for the field-extraction algorithm.”

Document the command, inputs, outputs, dependencies, and errors.
The source analyzes forms into JSON with field type and coordinates.
It checks bounding-box overlaps with `OK` or conflict details.
It then fills the PDF.
A signature field can have `"type": "sig"`, `"x": 150`, and `"y": 500`.
Exact types and coordinates depend on the supplied script and form.

## A19: Visual analysis

If layout matters and visual tools exist, render the input into images.
The source converts a PDF into page images, then identifies field positions and types.
Check each required page.
Do not assume visual access.
Do not replace available original data with an unsupported visual guess.

## A20: Checked intermediate outputs

Before batch, destructive, high-stakes, or complex changes, create a structured plan.
Use this sequence:

1. Analyze the requested changes.
2. Create the plan.
3. Check the plan.
4. Get required user approval.
5. Execute the plan.
6. Check the result.

While you correct the plan, keep originals unchanged.

The source's 50-field PDF example uses `changes.json`.
Checks catch nonexistent fields, conflicting values, missed required fields, and incorrect updates.
Machine checks make failures reproducible and help debugging before changes occur.

Give specific errors with available alternatives, for example:

```text
Field 'signature_date' not found.
Available fields: customer_name, order_total, signature_date_signed
```

A passed plan check does not replace required user approval for execution.

## A21: Dependencies and client capabilities

List required packages in the skill.
Before use, check their availability.
Do not assume a PDF library or other tool is installed.
If the client supports package installation and the user authorizes it, document the installation procedure.
The source shows `pip install pypdf` before a `PdfReader` example.
Dependency examples include npm and PyPI packages or GitHub repositories.

Before you select a dependency approach, check the target client's capabilities and policy:

- Check the available tools and packages.
- Check whether network access is available and permitted.
- Check whether package installation is available and permitted.
- Check repository access and permissions.
- Check whether dependencies must be supplied before execution.

If network access or package installation is unavailable, check whether available dependencies satisfy the task.
If available dependencies satisfy the task, use them.
If available dependencies cannot satisfy the task, report the missing requirement.
Before you install a package, get any required approval.
Check the target client's documentation for supported execution behavior.
Do not run an installation merely because a source example includes it.

## A22: File access and execution

File access, shell tools, and code execution depend on the target client.
Metadata-first discovery and on-demand resource reads also depend on client support.

Before you rely on these capabilities, check the client's exposed tools and resource-loading behavior.
If the client supports metadata-first discovery, keep names and descriptions sufficient for selection.
If the client supports on-demand file reads, link resources for the relevant task.
If the client exposes Bash or another shell, document compatible commands.
If the client supports script execution, document the supported command and working directory.
Check which script inputs and results the client adds to context.

If the client supports deferred loading, references, datasets, and API documentation can remain outside context until read.

If complete resources help the task, bundle them.
Organize resources by domain or feature.
If script execution is available, use deterministic scripts for repeated checks.
These scripts can replace repeated model-generated code.
State whether a script is executed or read as reference.
Evaluate file access with real requests.

In the BigQuery example, a revenue request loads the finance reference, not sales or product.
Do not assume another client exposes the same filesystem or execution tools.

## A23: Qualified MCP tools

If the client supports tool qualification, use its exposed names.
Qualification can prevent ambiguous discovery and “tool not found” errors.
The source illustrates the format `ServerName:tool_name`:

```text
BigQuery:bigquery_schema
GitHub:create_issue
```

`BigQuery` and `GitHub` are servers. The parts after the colon are tools.
Check the actual exposed names in the target client.
Some clients encode qualification in another form.
Do not rewrite a working tool identifier into unsupported syntax.
Qualification does not authorize an external side effect.

## A24: Final checklist

Core quality:

- [ ] The description states the capability, trigger contexts, and specific terms.
- [ ] The review considers the source's 500-line recommendation without treating it as a universal limit.
- [ ] The main body links detailed material.
- [ ] The target client's schema and resource-loading behavior are checked.
- [ ] References are one level deep and use progressive disclosure.
- [ ] Long references have contents lists.
- [ ] Workflows have clear steps and concrete examples.
- [ ] Terminology is consistent.
- [ ] Obsolete guidance is absent or isolated as an old pattern.

For skills with code or scripts:

- [ ] Scripts handle expected errors rather than deferring all recovery.
- [ ] Errors are explicit and helpful.
- [ ] Configuration values have documented reasons.
- [ ] The skill lists required packages.
- [ ] Required packages are available.
- [ ] Dependency guidance reflects checked capabilities, policy, and required approval.
- [ ] Script documentation states execution intent, arguments, and outputs.
- [ ] Example paths use forward slashes.
- [ ] Critical operations have checks and feedback loops.
- [ ] High-stakes changes have a checked intermediate plan and required approval.

Evaluation:

- [ ] At least three gap-based evaluations exist.
- [ ] Evaluations cover the intended models and clients.
- [ ] Real workflows and resource navigation are checked.
- [ ] If applicable team feedback is available, the review includes it.
- [ ] The report identifies missing runs and unchecked claims.

Before installation or deployment, check the relevant client documentation.
Do not change clients as a side effect of a tuning request.
Do not deploy skills as a side effect of a tuning request.
