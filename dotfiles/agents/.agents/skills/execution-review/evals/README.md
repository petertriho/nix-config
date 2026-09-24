# Execution Review regression fixtures

Small, offline fixtures for comparing an old skill with a revised skill.
Python 3.10+ standard library only, plus `git` on PATH. There is no agent
launcher, network access, paid call, automatic grader, or skill snapshotter
here. The caller supplies both skill versions separately.

## Prepare

From this directory:

```sh
python prepare.py --workspace /absolute/path/to/fresh-workspace \
  --cases 1 2 3 4 5 6 7 8 9 10 11
```

Select any nonempty subset of IDs. The workspace must be an **absolute,
nonexistent** directory whose parent already exists, with no `..` components
or symlink ancestors. Existing directories (even empty), files, and dangling
symlinks are rejected, as are duplicate or unknown IDs. A failed preparation
is not resumable: inspect/remove any partial workspace yourself and choose a
fresh path. Nothing is overwritten.

```text
fresh-workspace/
  eval-1-clean-pass/
    eval_metadata.json             # grader only: expectations and assertions
    old_skill/
      run.json                    # caller: paths/prompt/baseRef + input inventory
      repo/                       # git repo: base commit + uncommitted implementation
        .artifacts/clean-pass/PLAN.md
        .artifacts/clean-pass/TASKS.md
        api.mjs, impl.mjs, app.mjs, docs/labels.md
      outputs/                    # initially empty
    with_skill/
      run.json
      repo/                       # identical git history and worktree bytes
      outputs/
```

Every `run.json` contains absolute `cwd`, `plan`, `tasks`, and `target`
paths, the base-commit `baseRef`, and a fully resolved `prompt`. `target` is
always `outputs/REVIEW.md`. The repo is a real git repository: the base
commit holds sources plus `PLAN.md`/`TASKS.md`, and the implementation under
review is uncommitted worktree state. `prepare.py` sets fixed commit dates,
so every preparation of a case gets the same `baseRef`. The case-11 prompt
gives no `PLAN.md` or `TASKS.md` path. For that case, `plan` and `tasks`
record the expected selection, `.artifacts/prefix-rollout/`, for graders
only. Run each subject agent with its
variant's `cwd` and `prompt`, loading the appropriate skill version. The
subject must resolve scope with:

```sh
git-diff-scope --ref "$baseRef" --include-untracked --pretty
```

Do **not** give subjects the assertions, metadata, this README, or the
suite's `evals.json`; copy only skill instructions and needed references
into separately supplied skill snapshots, not this `evals/` directory. Save
transcripts outside the repo and `outputs/` so those locations remain useful
write-boundary checks. These directories are separation by convention, not a
security sandbox; the caller controls what each subject can access.

## Cases

| ID | Regression | Expected review |
|---|---|---|
| 1 | Clean prefix change, docs updated, both tasks checked | APPROVED; no findings |
| 2 | T1 checked but prefix still `tag:` | NEEDS CHANGES; checkbox mismatch |
| 3 | Correct prefix plus uppercase conversion | NEEDS CHANGES; implemented non-goal |
| 4 | Correct prefix plus export-chain rewrite | NEEDS CHANGES; reversed settled decision |
| 5 | Explicit missing TASKS.md alongside a readable decoy | NOTHING REVIEWED; never substitute decoy |
| 6 | Correct code, manual TUI acceptance cannot rerun offline | APPROVED; unverified line, not inflated |
| 7 | Clean implementation; unplanned uppercase is not required | APPROVED; no imported scope |
| 8 | T1 checked and met; T2 correctly unchecked with block note | APPROVED; no mismatch |
| 9 | Revised plan replaces `label:` with `lbl:`; corrective T3 supersedes checked T1/T2 criteria | APPROVED; supersession recorded, not a mismatch |
| 10 | Test-first handoff with insufficient `Handoff evidence`; test passes now | APPROVED; T1 handoff line unverified |
| 11 | No plan paths; newest `.artifacts` directory has only `PLAN.md` | APPROVED; selects `prefix-rollout/` and states it |

Cases 1–4 and 6–11 use the same small label-preview plan or a variant of
it. Case 5 tests input handling only. Case 11 sets the modification times of
its three `.artifacts` directories from `IMPLICIT_ARTIFACTS`. Case 10 adds a
`node:test` file. Without Node, a reviewer cannot rerun `node --test`, and
the T2 acceptance becomes unverified. No fixture requires a TUI or network
access.

## Integrity and grading

`fixture_input_hashes` maps each worktree file's repo-relative POSIX path to
its SHA-256 hex digest. `.git/`, `outputs/`, `run.json`, and
`eval_metadata.json` are excluded. After a subject run, a trusted caller can
import `prepare.input_manifest(repo)` and compare the **entire dictionary**
with the saved `run.json` field. Compare key sets too: checking only saved
hashes would miss newly created files. Deleted or changed files also fail
integrity. Check that `outputs/` contains only `REVIEW.md`, that no other
review artifact was written elsewhere, and that `PLAN.md`/`TASKS.md`
checkboxes are unchanged. Also check that `git stash list` is empty. In case
11, check that the modification times of the `.artifacts` directories are
unchanged. Preserve the pre-run metadata/inventories as
caller-owned records, not subject-editable input.

Grade the assertions in `eval_metadata.json` against the report, final
response, transcript/tool calls, and integrity checks. Verdict correctness
alone does not prove conformance-table accuracy, severity calibration,
citation accuracy, or read-only behavior.

## Offline infrastructure tests

From the checkout root:

```sh
python -B -m unittest discover \
  -s dotfiles/agents/.agents/skills/execution-review/evals \
  -p 'test_prepare.py' -v
```

Tests create temporary workspaces beneath this directory and clean them up.
They check JSON shape, paired identical bytes and git history, resolved
paths, hashes, missing-input construction, mutation detection, CLI
selection, overwrite/traversal rejection, the shapes of cases 9–11, and
equal base refs across preparations. They never execute fixture
source.

**Passing these tests validates fixture infrastructure, not model behavior.**
Actual paired model evaluations, assertion grading, and old/new skill
snapshots are deliberately left to the caller; no model scores are claimed
by this suite.
