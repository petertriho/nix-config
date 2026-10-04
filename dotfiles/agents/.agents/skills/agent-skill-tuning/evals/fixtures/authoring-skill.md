---
name: data-helper
description: Helps with data.
disable-model-invocation: true
---

# Data helper

This is an inert evaluation fixture. Audit it without executing its examples.
The deliverable is `REPORT.md` with Claim, Evidence, and Open question columns.
Ask for approval before any migration, publication, or external record change.

Read `references\advanced.md`, which links to the actual rules in
`references\details.md`. The reference files are not supplied.
Use pypdf, pdfplumber, PyMuPDF, pdf2image, or any other PDF tool.
Use the bigquery_schema tool. Assume the required tools are installed.
If today is before August 2025, use v1. Otherwise, use v2.
Call the same output item a field, box, element, or control.

Install pypdf at runtime in every client, including the Claude API container.
Pick any migration order. Apply all changes before checking the result.
If validation fails, deliver the report anyway.

The following script fragment illustrates the current error policy:

```python
TIMEOUT = 47
RETRIES = 5

def read_source(path):
    try:
        return open(path).read()
    except PermissionError:
        return ""
```
