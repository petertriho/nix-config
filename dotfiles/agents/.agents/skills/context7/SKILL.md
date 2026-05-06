---
name: context7
description: Resolves Context7 library IDs and fetches current, version-aware library and framework documentation with code examples. Use when a coding task needs accurate docs.
---

# Context7 HTTP API

## Overview

Use this skill to retrieve up-to-date library documentation from Context7.

## Inputs

- `query` (required): specific task/question.
- `libraryName` (required if `libraryId` is unknown): package/library name.
- `libraryId` (optional): `/owner/repo`, `/owner/repo/version`, or `/owner/repo@version`.
- `CONTEXT7_API_KEY` (optional): bearer token for better reliability.

## Workflow

1. If `libraryId` is already known, skip search and fetch context.

2. Resolve library ID:

```bash
curl -sS --get "https://context7.com/api/v2/libs/search" \
    --data-urlencode "libraryName=${LIBRARY_NAME}" \
    --data-urlencode "query=${QUERY}" \
    -H "Authorization: Bearer ${CONTEXT7_API_KEY}" \
    | jq '.results[:5] | map({id, title, state, trustScore, benchmarkScore, totalSnippets})'
```

Pick the best match by: closest title match, `state == "finalized"`, then higher `trustScore`/`benchmarkScore`, then `totalSnippets`.

3. Fetch context:

```bash
curl -sS --get "https://context7.com/api/v2/context" \
    --data-urlencode "libraryId=${LIBRARY_ID}" \
    --data-urlencode "query=${QUERY}" \
    --data-urlencode "type=txt" \
    -H "Authorization: Bearer ${CONTEXT7_API_KEY}"
```

## Errors

- `301`: use returned `redirectUrl` as new `libraryId`.
- `401`/`403`: verify API key and access permissions.
- `404`: re-run library search and select a different ID.
- `429`: honor `Retry-After`, then retry with backoff.
- `202`/`422`: choose another candidate or broaden `query`.

## Answer Rules

- Prefer docs-derived guidance over memory if they conflict.
- Include the exact `libraryId` used (and version if pinned).
- Cite source URLs from snippets when available.
- State uncertainty when docs do not directly answer the question.
