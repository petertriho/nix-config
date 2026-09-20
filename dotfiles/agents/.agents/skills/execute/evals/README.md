# Execute regression fixtures

Small, offline fixtures for comparing an old skill with a revised skill.
Python 3.10+ standard library only, plus `git` on PATH. There is no agent
launcher, network access, paid call, automatic grader, or skill snapshotter
here. The caller supplies both skill versions separately.

Unlike the review harnesses, subjects **must edit** the fixture repo: that
is the work under evaluation. Integrity therefore means something
different here. See below.

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
  eval-1-simple-prefix/
    eval_metadata.json             # grader only: expectations and assertions
    old_skill/
      run.json                    # caller: paths/prompt/baseRef + base inventory
      repo/                       # git repo: base commit holds bug + PLAN + TASKS
        .artifacts/simple-prefix/PLAN.md
        .artifacts/simple-prefix/TASKS.md
        api.mjs, impl.mjs, app.mjs, docs/labels.md
      outputs/                    # stays empty; grading reads the worktree
    with_skill/
      run.json
      repo/
      outputs/
```

Every `run.json` contains absolute `cwd`, `plan`, and `tasks` paths, the
base-commit `baseRef`, and a fully resolved `prompt`. `target` is JSON
`null`: there is no review-style output file. The subject implements
`TASKS.md` in the worktree, updates checkboxes, and reports validation in
its final message.

Run each subject agent with its variant's `cwd` and `prompt`, loading the
appropriate skill version plus `references/subagents/` role prompts. Do
**not** give subjects the assertions, metadata, this README, or the suite's
`evals.json`; copy only skill instructions and role prompts into separately
supplied skill snapshots, not this `evals/` directory. Save transcripts
outside the repo: the repo diff itself is the primary grading evidence.
These directories are separation by convention, not a security sandbox; the
caller controls what each subject can access.

## Cases

| ID | Regression | Expected implementation |
|---|---|---|
| 1 | Prefix change in code and docs | Both tasks checked, trace validated, tight diff |
| 2 | Prefix change with required regression test | New `test/` file, `node --test` green |
| 3 | Prefix change beside casing/API non-goals | No uppercase, trim preserved, chain untouched |
| 4 | Second task demands a forbidden export rewrite | T2 unchecked with Validation note; blocker reported |
| 5 | Second task needs an unavailable live TUI | T2 unchecked with Validation note; skips reported |
| 6 | One-line prefix fix | Only `app.mjs` changes; no new files or scaffolding |

All fixtures need only `node` for validation. No fixture requires network
access, a live TUI, or installed dependencies.

## Integrity and grading

`fixture_input_hashes` records the base-commit worktree: every regular
file's repo-relative POSIX path with its SHA-256 hex digest, excluding
`.git/`, `outputs/`, `run.json`, and `eval_metadata.json`. After a subject
run, the trusted caller diffs the worktree against `baseRef`:

```sh
git -C <repo> status --porcelain
git -C <repo> diff HEAD --stat
```

Grade per-case allowed scope from `evals.json` assertions: which files may
change, which must not (especially `PLAN.md`, `api.mjs`, `impl.mjs` where
forbidden), required checkbox states, required `Validation note` contents,
and forbidden extras (new dependencies, scaffolding, staged or committed
changes). `PLAN.md` must be byte-identical to base in every case. `TASKS.md`
checkbox and note changes are expected; all other `TASKS.md` text must be
unchanged. Run the behavior checks yourself: trace the public export with
`node -e`, run `node --test` where a test file is required, and confirm
casing and trimming survive. Preserve the pre-run metadata/inventories as
caller-owned records, not subject-editable input.

Grade the assertions in `eval_metadata.json` against the worktree diff,
`TASKS.md` state, final response, and transcript/tool calls. A green test
run alone does not prove minimal diff, checkbox honesty, or blocker
discipline.

## Offline infrastructure tests

From the checkout root:

```sh
python -B -m unittest discover \
  -s dotfiles/agents/.agents/skills/execute/evals \
  -p 'test_prepare.py' -v
```

Tests create temporary workspaces beneath this directory and clean them up.
They check JSON shape, paired identical bytes and git history, resolved
paths, hashes, mutation detection, CLI selection, and
overwrite/traversal rejection. They never execute fixture source.

**Passing these tests validates fixture infrastructure, not model behavior.**
Actual paired model evaluations, assertion grading, and old/new skill
snapshots are deliberately left to the caller; no model scores are claimed
by this suite.

Known fixture quirk: the global gitignore ignores `.artifacts`, so fixture
`PLAN.md`/`TASKS.md` are untracked in the fixture repos and checkbox edits
do not appear in `git status` or `git diff`. Grading does not depend on
that: the manifest covers every file and checkbox state is read from disk.
A future `prepare.py` revision should add a repo-local `.gitignore`
negation (`!.artifacts/`) so task files are tracked; regenerate the
workspace when that lands.
