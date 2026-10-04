---
name: data-helper
description: Helps with data.
disable-model-invocation: true
---

# Data helper

This is an inert evaluation fixture.
Audit it without running its examples.
The deliverable is `REPORT.md` with Claim, Evidence, and Open question columns.
Before any migration, publication, or external record change, ask for approval.

Read `references\advanced.md`.
This file links to the actual rules in `references\details.md`.
The fixture does not include these reference files.
Use pypdf, pdfplumber, PyMuPDF, pdf2image, or any other PDF tool.
Use the bigquery_schema tool.
Assume that the client has all required tools installed.
If today is before August 2025, use v1.
Otherwise, use v2.
Call the same output item a field, box, element, or control.

In every client, including runtimes without network access or package installation, install pypdf at runtime.
Pick any migration order.
Before any result check, apply all changes.
If the result check fails, deliver the report anyway.

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
