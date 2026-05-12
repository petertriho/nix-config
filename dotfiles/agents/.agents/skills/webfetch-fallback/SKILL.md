---
name: webfetch-fallback
description: Fallback web retrieval and current web research via Gemini CLI when normal webfetching is blocked, empty, stale, JavaScript-only, CAPTCHA/cookie-walled, rate-limited, or otherwise insufficient. Use this skill whenever webfetch returns 403/429/errors/JS shells, when direct HTTP tools cannot reach a page, when a rendered page or current search synthesis is needed, or when the user needs verification from live web sources. Do not use it for local files or simple pages that webfetch already retrieved cleanly.
---

# Webfetch Fallback via Gemini

When the built-in `webfetch` tool fails or cannot provide enough evidence, use Gemini CLI as a fallback research channel. Gemini has its own browsing and search path and can often access or summarize pages that direct HTTP fetches cannot.

The goal is not merely to get any answer. The goal is to recover enough reliable, attributable information to answer the user's task while making the fallback transparent.

## When to use this

- `webfetch` returned a 403, 429, or other HTTP error
- `webfetch` returned empty or meaningless content (e.g., a JS shell with no rendered text)
- The site blocks automated scrapers/bots
- The user needs a rendered page, current search, or multi-source web synthesis and direct retrieval is inadequate
- You need current web search or synthesis from multiple sources and the available fetch tool cannot retrieve enough context
- A redirect chain or cookie wall prevented `webfetch` from reaching the actual content
- You need to verify a claim from the web but direct retrieval is unreliable
- The target content is on Reddit, X/Twitter, LinkedIn, forums, or other sites that often return bot checks, login walls, or incomplete static HTML

Prefer other tools when they fit better:

- Use ordinary `webfetch` first for simple pages that are likely to fetch cleanly.
- Use repository/file tools for local files; do not ask Gemini to inspect local paths unless you intentionally provide the relevant text.
- Do not send secrets, private local file contents, tokens, cookies, or credentials to Gemini.

## Expected output

When Gemini supplies the answer, include a short provenance note in your response when useful:

- `Source checked via Gemini fallback: <URL or search query>`
- Mention if Gemini summarized rather than returned exact text.
- If the result is uncertain, say what could not be verified instead of overstating confidence.

For research answers, prefer concise synthesis with source URLs. For extraction tasks, quote exact relevant snippets when Gemini provides them; otherwise label the content as a summary. Never present fallback summaries as direct page text unless Gemini clearly returned exact quotes.

## How it works

Gemini CLI can run as either a one-shot command or an interactive tmux session. Gemini handles browsing internally: it can follow links, render JS-heavy pages, and search the web.

- Use `gemini -p` for short, headless checks where one response is enough.
- Use tmux for longer research, follow-up questions, or when you need to watch progress and capture incremental output.

For tmux, pick a unique session name (e.g., `gemini_<random>`) and use it consistently throughout. Use one session per task so context remains coherent. Kill the session when finished unless you need another immediate follow-up.

## Workflow

### 1. Try the direct path first

If the user gave a URL and the page is not obviously JS-heavy or protected, try `webfetch` first. If it returns useful content, use that content directly and do not invoke this fallback.

Skip directly to Gemini when the task is explicitly web search, the site is known to block static fetches, or the existing `webfetch` result is clearly unusable.

### 2. Choose execution mode

For a simple one-shot query, prefer headless execution:

```bash
gemini -p "$(cat <<'EOF'
<focused query here>
EOF
)"
```

If the answer is incomplete, missing sources, or needs follow-up, switch to a tmux session rather than repeatedly sending disconnected one-shot prompts.

For interactive work, start Gemini in tmux:

```bash
tmux new-session -d -s '<session_name>' -x 200 -y 50
tmux send-keys -t '<session_name>' 'gemini' Enter
sleep 3
```

If Gemini opens slowly, capture the pane once before sending the task so you can confirm the prompt is ready.

```bash
tmux capture-pane -t '<session_name>' -p -S -80
```

### 3. Send a focused query

Craft your query based on what you need. Examples:

- URL extraction: `Fetch <URL>. Return the main article text, title, author/date if visible, and the canonical/source URL. Quote exact text for the parts relevant to: <user need>.`
- Blocked page summary: `The direct fetch for <URL> failed with <error>. Please access the page and summarize the relevant content. Include source URL and distinguish exact quotes from summary.`
- Search synthesis: `Search the web for <question>. Use recent, authoritative sources. Return a concise synthesis with source URLs and dates if available.`
- Claim verification: `Check whether this claim is supported: <claim>. Search the web, cite sources, and explain uncertainty or conflicting evidence.`
- Rendered-page extraction: `Open <URL> as a rendered page. Extract <specific fields/sections>. Include source URL, visible dates, and say whether each item is quoted text or summarized.`

Send the query with tmux:

```bash
tmux send-keys -t '<session_name>' "$(cat <<'EOF'
<focused query here>
EOF
)" Enter
sleep 30
tmux capture-pane -t '<session_name>' -p -S -500
```

Adjust wait time to the task: 15-30 seconds for a simple URL, 45-90 seconds for multi-source research. If the response is still generating, wait and capture again.

### 4. Verify Enter was actually sent

Look for YOUR QUERY TEXT. Is it inside or outside the bordered box?

**Enter NOT sent** — query is INSIDE the box:
```
╭─────────────────────────────────────╮
│ > Your actual query text here       │
╰─────────────────────────────────────╯
```

**Enter WAS sent** — query is OUTSIDE the box, followed by activity:
```
> Your actual query text here

⠋ Our hamsters are working... (processing)

╭────────────────────────────────────────────╮
│ >   Type your message or @path/to/file     │
╰────────────────────────────────────────────╯
```

The empty prompt `Type your message or @path/to/file` always appears in the box — that's normal. What matters is whether YOUR query text is inside or outside the box.

If your query is still inside the box, send Enter: `tmux send-keys -t <session_name> Enter`

### 5. Validate the response

Before using Gemini's answer, check for these failure patterns:

- The answer is generic and does not mention the requested URL/query specifically.
- It lacks source URLs for a research task.
- It appears to hallucinate exact quotes without identifying where they came from.
- It says it cannot browse or asks you to do the browsing yourself.
- It is stale for a time-sensitive question.
- It gives confident facts but no visible date, source, or caveat for time-sensitive material.

If this happens, send a narrower follow-up in the same session. Ask Gemini to provide source URLs, exact snippets, dates, or to state that it cannot verify the content.

Example follow-up:

```text
Please tighten this: list the source URLs you used, quote the exact sentence that supports the answer, and say if any part is inferred rather than directly visible.
```

If Gemini still cannot provide sources or exact snippets, you may use the answer only as an uncertain summary and should say so plainly.

### Reddit and forum searches

For Reddit or forum content, treat Gemini primarily as source discovery unless it returns exact quotes with stable URLs. These sites often expose partial content, bot checks, deleted comments, or personalized ranking, so verification matters.

Recommended pattern:

- Ask Gemini for specific thread/comment URLs, subreddit/forum names, approximate dates, titles, and exact snippets.
- Prefer narrow searches such as `site:reddit.com/r/<subreddit> <product> <symptom>` when the user cares about a community-specific pattern.
- After Gemini returns candidates, verify what you can with direct fetches, `.json` endpoints, archive pages, or other accessible source URLs.
- Label Reddit/forum findings as anecdotal user reports unless there is an official response, changelog, incident report, or maintainer confirmation.
- Do not infer broad product behavior from a handful of posts; describe patterns as reports, clusters, or signals.
- In the final answer, include a brief source-method note such as `Gemini fallback was used for source discovery; retrieved threads were verified through Reddit JSON endpoints` or `Gemini fallback failed, so I used only directly verified Reddit JSON results`.

### 6. Handle Gemini/API failures

If Gemini appears to hang on `Thinking...` for a simple task, verify outside tmux with a short headless smoke test:

```bash
gemini -p 'Reply with exactly: ok'
```

If that returns `429`, `RESOURCE_EXHAUSTED`, `rateLimitExceeded`, or `quota exceeded`, Gemini is unavailable for this account/session. Stop and report the blocker. Retrying the same request or switching models usually still uses the same Code Assist quota and will not fix it.

If the error is model-specific, such as `model unavailable`, kill the session and retry once with a cheaper or more available model:

```bash
tmux kill-session -t '<session_name>'
tmux new-session -d -s '<session_name>' -x 200 -y 50
tmux send-keys -t '<session_name>' 'gemini -m gemini-3.1-flash-lite-preview' Enter
sleep 3
```

If Gemini is unavailable after one retry, stop and report the blocker. Do not invent web content.

### 7. Clean up when done

```bash
tmux kill-session -t '<session_name>'
```

## Query-writing tips

- Be explicit about the user goal. `Fetch this page` is weaker than `Fetch this page and extract the pricing table plus any caveats.`
- Ask for source URLs and dates for research. This makes the answer easier to verify and cite.
- Ask Gemini to distinguish exact quotes from summaries. This prevents accidental overclaiming.
- For large pages, ask for only the relevant sections instead of a full dump.
- For ambiguous questions, ask Gemini for likely interpretations and evidence rather than a single overconfident answer.
- Include the failed direct-fetch symptom when relevant (`403`, JS shell, cookie wall). It helps Gemini focus on the retrieval problem instead of giving a generic answer.
- Ask for canonical URLs when pages can redirect, syndicate, or mirror content.

## Shell safety

Queries often contain quotes, apostrophes, URLs with `&`, or shell metacharacters. Prefer safe quoting:

```bash
tmux send-keys -t '<session_name>' "$(cat <<'EOF'
<multi-line query here>
EOF
)" Enter
```

Avoid putting untrusted page text directly inside a single-quoted shell string if it may contain apostrophes. Use the heredoc pattern above for complex prompts.

For one-shot prompts, use the same heredoc pattern with `gemini -p`:

```bash
gemini -p "$(cat <<'EOF'
<multi-line query here>
EOF
)"
```

## Final-answer pattern

When the fallback materially affected the answer, briefly disclose it:

```text
I could not retrieve the page with webfetch, so I checked it through Gemini fallback. It reports that ...

Sources: <URL1>, <URL2>
```

If Gemini could only summarize the page, avoid wording like `the page says exactly`. Use `Gemini summarized the page as saying...` or `I could not verify exact wording, but the fallback result indicates...`.
