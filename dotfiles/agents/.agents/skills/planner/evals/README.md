# Planner regression fixtures

Small, offline fixtures for comparing an old skill with a revised skill.
Python 3.10+ standard library and `git` only. There is no agent launcher,
network access, paid call, automatic grader, or skill snapshotter here. The
caller supplies both skill versions separately. See [RESULTS.md](RESULTS.md)
for the initial comparison and its limitations.

The planner skill is an interview, and a subject agent cannot talk to a
person. Each case therefore starts at one point in a simulated conversation.
The prompt gives the earlier turns and the latest user message. The subject
records calls to `AskUserQuestion`, `EnterPlanMode`, and `ExitPlanMode`
instead of making them.

## Prepare

From this directory:

```sh
python prepare.py --workspace /absolute/path/to/fresh-workspace \
  --cases 1 2 3 4 5 6
```

Select any nonempty subset of IDs. The workspace must be an **absolute,
nonexistent** directory whose parent already exists, with no `..` components
or symlink ancestors. Existing directories (even empty), files, and dangling
symlinks are rejected, as are duplicate or unknown IDs. A failed preparation
is not resumable: inspect/remove any partial workspace yourself and choose a
fresh path. Nothing is overwritten.

```text
fresh-workspace/
  eval-5-explicit-revision-tasks/
    eval_metadata.json             # grader only: expectations and assertions
    old_skill/
      run.json                    # caller: paths, host, prompt, HEAD, input inventory
      repo/                       # git repository, 4 commits
        package.json, README.md
        src/{cli,store,format,csv}.mjs
        test/{store,csv}.test.mjs
        .artifacts/csv-export/{PLAN,TASKS}.md
      outputs/                    # initially empty
    with_skill/
      run.json
      repo/                       # identical input bytes and HEAD
      outputs/
```

Every `run.json` contains absolute `cwd` and `outputs` paths, the `host`
description, the `prompt`, `fixture_head`, and `fixture_input_hashes`. The
prompt is fully resolved except for one `{skill}` placeholder. Each repo is a
small Node notes CLI with 3 commits (4 in case 5). Commits have a fixed author
and fixed dates, so both variants of a case share one HEAD. `prepare.py`
ignores user and system git config, so signing and hooks cannot change the
commits. `.artifacts/` files are untracked.

## Run

1. In each `run.json` prompt, replace `{skill}` with the absolute path of the
   variant's `SKILL.md`. Use the old version for `old_skill` and the revised
   version for `with_skill`.
2. Give the prompt to a fresh subagent. Do **not** give subjects the
   assertions, metadata, this README, or the suite's `evals.json`.
3. Record the total tokens and duration from the completion notification in
   `timing.json` beside `run.json`.

The prompt forbids the Skill tool, so an installed `planner` skill cannot
replace the variant under test. Save transcripts outside the repo and
`outputs/` so those locations remain useful write-boundary checks. These
directories are separation by convention, not a security sandbox; the caller
controls what each subject can access.

## Cases

| ID | Scenario | Expected behavior |
|---|---|---|
| 1 | First message, Claude Code host | Reads code, then records one `AskUserQuestion` with the recommended option first. No plan. |
| 2 | First message, host with no question tool | One plain-text question with a recommendation, then the turn ends. |
| 3 | User stops after two answers; the third question is unanswered | `Draft` plan. The unanswered recommendation is a proposed default, not a settled decision. |
| 4 | Five answers; an unrelated `notes-export` plan exists | `Ready` plan in a new directory. The existing plan is untouched. `Blockers: None`. |
| 5 | Explicit revision from CSV to JSON Lines; `TASKS.md` has checked tasks | Edit in place. Keep user context and unaffected decisions. Name invalidated tasks. `TASKS.md` unchanged. |
| 6 | Native plan mode is active | Asks the user to switch to normal mode. No planning question and no plan-mode tool calls. |

## Integrity and grading

After the subject runs, from this directory:

```sh
python facts.py /absolute/path/to/fresh-workspace
```

For each run with `outputs/response.md`, `facts.py` compares the repo with
`run.json` and writes `facts.json` beside `run.json`:

- `source_unchanged`, `non_artifact_changes`, and `artifact_added`,
  `artifact_changed`, or `artifact_deleted`. The comparison uses both entire
  inventories, so added and deleted files count.
- `head_unchanged`: HEAD still equals `fixture_head`. A subject commit fails.
- `plans`: each added or changed `PLAN.md`, with its status line, the lines
  after it, the section order, and missing sections.
- `response`: `PLAN:` lines, `Status:` values, `Blockers: None`, and regex
  hits for tool names. A regex hit is a lead, not a verdict. "I did not call
  `ExitPlanMode`" also matches.

`facts.py` also copies each saved plan into `outputs/` so that the review
viewer shows it. Grade the assertions in `eval_metadata.json` against
`response.md`, `actions.md`, the saved plan, and `facts.json`.
`actions.md` is self-reported. It does not prove the order of reads.

## Offline infrastructure tests

From the checkout root:

```sh
python -B -m unittest discover \
  -s dotfiles/agents/.agents/skills/planner/evals \
  -p 'test_prepare.py' -v
```

Tests create temporary workspaces beneath this directory and clean them up.
They check JSON shape, paired identical bytes and HEADs, resolved prompts,
hashes, case shapes, `facts.py` output, mutation detection, CLI selection,
and overwrite/ID rejection. They never execute fixture source.

**Passing these tests validates fixture infrastructure, not model behavior.**
Actual paired model evaluations, assertion grading, and old/new skill
snapshots are deliberately left to the caller.
