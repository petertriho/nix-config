# Plan To Tasks regression fixtures

Small, offline fixtures for comparing an old skill with a revised skill.
Python 3.10+ standard library only; requires no git, network access, paid
call, automatic grader, or skill snapshotter. The caller supplies both skill
versions separately.

## Prepare

From this directory:

```sh
python prepare.py --workspace /absolute/path/to/fresh-workspace \
  --cases 1 2 3 4 5 6 7 8
```

Select any nonempty subset of IDs. The workspace must be an **absolute,
nonexistent** directory whose parent already exists, with no `..` components
or symlink ancestors. Existing directories (even empty), files, and dangling
symlinks are rejected, as are duplicate or unknown IDs. A failed preparation
is not resumable: inspect/remove any partial workspace yourself and choose a
fresh path. Nothing is overwritten.

```text
fresh-workspace/
  eval-1-prefix-tasks/
    eval_metadata.json             # grader only: expectations and assertions
    old_skill/
      run.json                    # caller: resolved paths/prompt + input inventory
      repo/
        api.mjs, impl.mjs, app.mjs, docs/labels.md
        .artifacts/prefix-tasks/PLAN.md
      outputs/                    # initially empty
    with_skill/
      run.json
      repo/                       # identical input bytes
      outputs/
```

Every `run.json` contains absolute `cwd`, `plan`, and `target` paths and a
fully resolved `prompt`. `target` is `outputs/TASKS.md`, except case 7, where
it is JSON `null` and the prompt supplies **no output destination**. Case 6
carries an existing task file beside the plan plus a revision sentence in the
prompt. Missing-plan cases still record the explicit requested absolute path.
Repos have no `.git`, skill snapshots, evaluation metadata, or
expected-answer files.

Run each subject agent with its variant's `cwd` and `prompt`, loading the
appropriate skill version. Do **not** give subjects the assertions, metadata,
this README, or the suite's `evals.json`; copy only skill instructions into
separately supplied skill snapshots, not this `evals/` directory. Do not pass
an output destination for case 7. Save transcripts outside the repo and
`outputs/` so those locations remain useful write-boundary checks. These
directories are separation by convention, not a security sandbox; the caller
controls what each subject can access.

## Cases

| ID | Regression | Expected tasks |
|---|---|---|
| 1 | Clean prefix plan | Faithful tasks, full fields, sane order, no invented scope |
| 2 | Explicitly rejected uppercase display | No uppercase task; non-goal carried in Out of scope |
| 3 | Draft with blocking Q1 | Gated tasks naming Q1; nothing invented as settled |
| 4 | Behavior change | Observable acceptance on every implementation task |
| 5 | Nonblocking docs wording gap | Explicit assumption in summary; sequencing unaffected |
| 6 | Revised plan plus existing checked tasks | Unchecked corrective task appended; IDs stable |
| 7 | Explicit missing plan alongside a readable decoy | No file anywhere; never substitute decoy |
| 8 | Two disjoint slices plus rollout | Disjoint tasks parallel; rollout depends on both |

Plans are short and local. No fixture requires Node, a TUI, or network
access.

## Integrity and grading

`fixture_input_hashes` maps each regular input file's repo-relative POSIX
path to its SHA-256 hex digest. After a subject run, a trusted caller can
import `prepare.input_manifest(repo)` and compare **both entire
dictionaries** with the saved `run.json` fields. Compare key sets too:
checking only saved hashes would miss newly created files. Deleted or
changed files also fail integrity. The inventory does not track empty
directories or file modes. Check that `outputs/` contains only `TASKS.md`
(or is empty for case 7), and that no additional task artifact was written
elsewhere. For case 6, the existing task file beside the plan must be
byte-identical after the run: revision output goes only to `outputs/`.
Preserve the pre-run metadata/inventories as caller-owned records, not
subject-editable input.

Grade the assertions in `eval_metadata.json` against the report, final
response, transcript/tool calls, and integrity checks. Task-count matching
alone does not prove field completeness, dependency sanity, or read-only
behavior.

## Offline infrastructure tests

From the checkout root:

```sh
python -B -m unittest discover \
  -s dotfiles/agents/.agents/skills/plan-to-tasks/evals \
  -p 'test_prepare.py' -v
```

Tests create temporary workspaces beneath this directory and clean them up.
They check JSON shape, paired identical bytes, resolved paths, hashes,
missing/empty inputs, revision-file construction, mutation detection, CLI
selection, and overwrite/traversal rejection. They never execute fixture
source.

**Passing these tests validates fixture infrastructure, not model behavior.**
Actual paired model evaluations, assertion grading, and old/new skill
snapshots are deliberately left to the caller; no model scores are claimed
by this suite.
