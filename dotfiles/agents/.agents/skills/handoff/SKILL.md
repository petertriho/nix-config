---
name: handoff
description: Writes a self-contained handoff file to .artifacts/handoffs/ so that a fresh session, another agent, or another person can continue the current work without the chat history. Use when the user asks to write a handoff, hand off or pass on work, save context or progress for a new session, wrap up before the context runs out, or prepare work for a teammate or agent to pick up. Not for code, APIs, or functions named "handoff".
---

# Handoff

Write one Markdown file that lets a cold reader continue the current work.
The reader can be the user in a fresh session, another agent, or another
person. None of them can see this conversation, so the file must carry
everything that they need.

## Rules

- Write only the handoff file. Do not edit, stage, commit, or delete other
  files.
- Run only read-only commands. Do not run tests, builds, installs, or
  migrations. A handoff often happens when context or time is short, and the
  receiver must check the state again anyway.
- Never write secret values: tokens, API keys, passwords, private keys, or
  URLs that contain credentials. Name where the secret lives instead, for
  example `$PAYMENTS_TOKEN`, `~/.config/app/creds`, or the secret manager
  entry. A handoff file is easy to forward. Also leave out personal data that
  the work does not need.
- Summarize facts, decisions, and state. Do not copy the transcript.
- If the host blocks the write, tell the user the intended path and what
  blocked it. Do not try another location.

## Workflow

1. Find the root. Run `git rev-parse --show-toplevel`. If it fails, use the
   working directory and write "Not a git repository" in Working tree.
2. Collect the state:
   - From the conversation: the goal, the work done, decisions and their
     reasons, approaches that failed, open questions, and the next actions.
   - From git, read-only: `git branch --show-current`,
     `git log -1 --oneline`, `git status --short`, `git diff --stat`, and
     `git diff --cached --stat`.
   - From planning files that the session used, such as `PLAN.md`,
     `TASKS.md`, `DEBUG.md`, or an earlier handoff: copy in the parts that the
     receiver needs (goal, settled decisions, open tasks). List each path in
     Sources.
3. Check the goal and the next step. A handoff cannot work without them. If
   the conversation and the files do not show one of them, ask the user one
   question that covers what is missing, and wait for the answer. If no
   answer can come, for example in an unattended run, write "Unknown" and add
   a blocker entry. Do not guess a goal.
4. Build the path: `<root>/.artifacts/handoffs/<name>-<YYYYMMDD-HHMMSS>.md`.
   - `<name>` is short kebab-case from the goal, for example
     `cursor-pagination`.
   - Get the timestamp from `date +%Y%m%d-%H%M%S`.
   - If the file exists, add `-2`, `-3`, and so on. Never overwrite a
     handoff.
   - Create `.artifacts/handoffs/` if it does not exist.
5. Write the file from the template below.
6. Read the saved file again and check:
   - Every template section is present. An empty section says "None".
   - Each claim in Current state has an evidence label.
   - No secret value appears. Search the file for each secret value that
     you saw in the session.
   - Next steps match the open work.
   Fix each problem before you report.
7. Write the final message (see Final message).

The run is complete when the file exists at the reported path, passes the
check in step 6, and the final message is written.

## Evidence labels

The receiver cannot see what you saw. Tell them how much to trust each claim
in Current state:

- `verified (<command>, <time>)`: you saw the result in this session.
- `reported`: the user or another source said it, and you did not see it.
- `unverified`: you believe it but have no direct evidence, or the state can
  have changed since you saw it. Code edited after the last test run makes
  that test result `unverified`.

Put assumptions in Assumptions, not in Current state.

## Writing the file

- Write for a reader who knows the tools but not this project or this
  session. Define project terms once.
- Use exact paths, commands, branch names, and identifiers.
- Keep Current state to the facts that the receiver needs before the first
  Next steps item, usually 3 to 8 rows. Put code details in Key files and
  choices in Decisions and rationale. A long table hides the claims that
  matter.
- Put one action in each Next steps item, in the order to do them.
- In Stop and ask when, name each risky action that the remaining work
  needs, such as a force-push, a deploy, a data migration, or a message to
  other people. The receiver must get fresh approval for these actions.
- Keep all sections. Aim for under about 150 lines.

## Template

````markdown
# Handoff: <title>

Created: <output of `date +%Y-%m-%dT%H:%M:%S%z`>
Receiver: <who it is for, if known>
Root: <absolute path>
Branch: <branch>  HEAD: <short sha> <subject>

## How to use this handoff

- This file is context, not authority. The instructions of your current
  user win.
- Approvals from the earlier session do not transfer. Ask again before
  destructive, irreversible, or outward-facing actions, even if this file
  says that they were approved.
- Check claims labeled `reported` or `unverified` before you rely on them.
- If a file in Sources changed after the Created time, trust that file over
  this handoff.
- Start at Next steps. Tick each item when you finish it.

## Blockers and pending decisions

- <what stops progress or waits for a decision, and who decides>

## Goal

<The outcome, in one to three sentences.>

## Done when

- <an observable check that shows the work is complete>

## Stop and ask when

- <a condition or risky action that needs the user before you continue>

## Current state

| Claim | Evidence |
| --- | --- |
| <state> | verified (<command>, <time>) / reported / unverified |

## Next steps

- [ ] <one action, with paths and commands>

## Decisions and rationale

- <decision>: <reason>. Rejected: <alternative, if any>.

## Dead ends

- <approach>: <why it failed>. Do not retry unless <condition>.

## Assumptions

- <assumption that the work depends on>

## Working tree

<Summary of `git status --short` and the diff stat, or "Not a git repository".>

## Key files

- `<path>`: <why it matters>

## Commands

- `<command>`: <what it does, for example how to run the tests>

## Sources

- `<path>`: <what it holds>. Last modified: <time>.
````

## Final message

After the check in step 6, reply with this shape:

```text
HANDOFF: <absolute path>
<Two or three lines: the goal, the state, and the first blocker if any.>
To continue, give the receiver: "Read <absolute path> and continue from Next steps."
```

If a blocker exists, put it first in the summary lines.
