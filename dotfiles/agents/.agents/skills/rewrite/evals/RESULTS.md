# Rewrite skill eval results

## Scope

On 2026-10-19, run the 6 cases in `evals.json` against the first version of
`SKILL.md`. Each case ran once. A failed case ran again after a correction.
Three manual checks cover the directory confirmation and the missing-skill
rules, which the eval cases do not cover.

These are single-trial observations. They do not measure variance between
runs, and they do not compare the skill with a baseline.

## Method

- Each run used a fresh `general-purpose` subagent with `claude-opus-5-5`.
- Each run had its own workspace under `/tmp`, with a git baseline commit.
  The fixtures were copied into the workspace. No run used the repository.
- The prompt gave the absolute path of `SKILL.md` and the user request. It
  told the subagent not to read `evals/`.
- The author of the skill graded each run by hand against
  `expected_output`. Grading was not blind.
- File cases were checked with `git diff`. Case 2 was also checked with an
  AST comparison after the removal of docstrings, and with a byte search
  for each protected line.
- Pasted-text cases were checked for created or changed files with
  `git status --untracked-files=all`.

## Eval cases

| Case | First run | Rerun |
| --- | --- | --- |
| 1 README with pitch, steps, code block, anchor | Fail | Pass |
| 2 Code comments in `ratelimit.py` | Pass | Not run |
| 3 Pasted email | Pass | Not run |
| 4 Pasted CLI error messages | Pass | Not run |
| 5 Pasted landing page copy | Pass | Not run |
| 6 Unclear `cache.md` | Pass | Not run |

- Case 1, first run: the run met every expectation except one. The pitch
  lost all of its voice and became "tidyq is a JSON formatter." with the
  benchmark. The run applied the documentation genre rule of `write-better`,
  which removes personality. `SKILL.md` did not say how to classify a pitch
  that mixes facts and persuasion.
- Correction: a persuasive passage inside a README or other docs is now
  voice-driven prose. It keeps its facts, genuine opinions, and contractions,
  and it loses only the promotional words that state no fact.
- Case 1, rerun: the pitch kept "honestly, once you've tried it, you won't go
  back" and the benchmark. The code block was byte-for-byte equal. The heading
  "Stuff That Breaks Sometimes" kept its words, so its anchor link still
  resolved. The run also flagged the unknown macOS versions. That flag was
  not necessary, but it did no harm.
- Case 2: the AST without docstrings was identical before and after. The
  string literal, the license lines, `# noqa: F401`,
  `# type: ignore[operator]`, and `# pragma: no cover` were unchanged. The
  run deleted the 3 comments that restate the code and listed each one with
  `path:line`. It kept `TODO(peter)` and `#42`, and reworded the TODO text.
- Case 3: the rewrite kept every fact, "might", the contractions, the
  greeting, and the sign-off. The problem comes before the request.
  `write-better` lists "the problem" as a valid lead, so this passed.
- Case 4: message 2 kept "might" for the possible causes and got no invented
  fix. The original message had no fix.
- Case 5: the run flagged "Trusted by thousands of teams worldwide" and
  "AI-powered" with a question each. It added no numbers or features.
- Case 6: the run kept the ambiguous "it" and "This" and the 3x claim, and
  flagged each one with a question. It also flagged the unclear scope of the
  10-minute expiry.

No run staged or committed changes. No pasted-text run created a file. No
run changed a file in the repository.

## Manual checks

| Check | Result |
| --- | --- |
| Directory target (`docs/` with 2 files) | Pass: listed both files, asked for confirmation, and changed no file |
| `asd-ste100` missing | Pass: rewrote with `write-better` and named the missing skill in a note |
| Both writing skills missing | Pass: stopped without a rewrite and said why |

The missing-skill checks are simulations. The prompt told the subagent that
the skill was absent. The skill was still installed, so these checks do not
show what a client does when the skill tool really lacks the skill.

## Changes after the last run

After the case 1 rerun, two sentences in `SKILL.md` were split to meet the
STE limits. One sentence lists the kinds of unclear passages. The other gives
the procedure rules. Both edits change wording only, not rules. No eval ran
against the final wording.
