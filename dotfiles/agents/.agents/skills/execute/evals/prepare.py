#!/usr/bin/env python3
"""Materialize paired, local-only execute fixtures. No agent execution."""

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path
from textwrap import dedent


def text(value):
    return dedent(value).strip() + "\n"


SOURCES = {
    "api.mjs": 'export { formatLabel } from "./impl.mjs";\n',
    "impl.mjs": text('''
        export function formatLabel(value, { prefix = "" } = {}) {
          return `${prefix}${value.trim()}`;
        }
    '''),
    "app.mjs": text('''
        import { formatLabel } from "./api.mjs";

        export function previewLabel(value) {
          return formatLabel(value, { prefix: "tag:" });
        }
    '''),
    "docs/labels.md": text('''
        # Label preview

        The preview adds `tag:` to a whitespace-trimmed label.
        `" blue "` displays as `"tag:blue"`; `""` displays as `"tag:"`.
        Input is a string. Casing is preserved.
    '''),
}

CLEAN_PLAN = text('''
    # Label preview prefix

    Status: Ready

    ## Goal
    Change the preview label prefix from `tag:` to `label:`. Keep the
    string-only input contract and synchronous return value.

    ## Non-goals
    No case normalization, new input types, API changes, dependencies, or
    persistence. Do not change the export structure.

    ## Assumptions
    `app.mjs` defines `previewLabel(value)` and calls `formatLabel` through
    `api.mjs` from `impl.mjs`. The implementation accepts
    `formatLabel(value, { prefix = "" } = {})`, trims value, then prefixes it.
    `docs/labels.md` documents the current preview.

    ## Settled Decisions
    Use the existing options object. Preserve whitespace trimming and casing.
    Leave `api.mjs` and the export chain unchanged.

    ## Implementation Plan
    1. In `app.mjs`, change only the prefix option from `"tag:"` to `"label:"`.
    2. In `docs/labels.md`, replace the documented prefix and update the two
       examples to `"label:blue"` and `"label:"`; retain the string-input rule.

    ## Validation
    Review the diff and trace `" blue "` and `""` through the public export
    to confirm those exact outputs. Check that no other source changes occur.

    ## Risks and Mitigations
    Accidentally changing casing or trimming would break existing semantics;
    the spaced, lowercase example and unchanged implementation check cover both.

    ## Open Questions
    None.
''')

TASKS_SIMPLE = text('''
    # Tasks — label preview prefix

    ## Task Summary
    Switch the preview prefix to `label:` in code and docs, then validate.

    ## Tasks

    - [ ] T1: Switch preview prefix to label:
      - Why: The plan requires the `label:` prefix for preview labels.
      - Depends on: None
      - Scope: In `app.mjs`, change only the prefix option to `"label:"`.
      - Out of scope: Casing changes, API changes, export-chain rewrites.
      - Acceptance: `app.mjs` passes `"label:"` as the prefix option; `" blue "` traces to `"label:blue"`.

    - [ ] T2: Update preview docs
      - Why: Docs must match the new prefix before handoff.
      - Depends on: T1
      - Scope: Update both examples in `docs/labels.md` to `label:` outputs.
      - Out of scope: New guides, API docs, unrelated copy edits.
      - Acceptance: `docs/labels.md` shows `"label:blue"` and `"label:"`.

    ## Suggested Sequence
    T1, then T2.

    ## Validation Plan
    Diff review of `app.mjs` and `docs/labels.md` plus a public-export trace.

    ## Remaining Open Questions
    None.
''')

TASKS_TDD = text('''
    # Tasks — label preview prefix with regression test

    ## Task Summary
    Cover the prefix behavior with a public-interface regression test, then
    switch the prefix and update docs.

    ## Tasks

    - [ ] T1: Add prefix regression test and switch prefix
      - Why: The plan requires the `label:` prefix; observable behavior needs
        a runnable regression check through the public interface.
      - Depends on: None
      - Scope: Add a test under `test/` importing `previewLabel` from
        `app.mjs` asserting `" blue "` gives `"label:blue"` and `""` gives
        `"label:"`; change only the prefix option in `app.mjs` to `"label:"`.
        Run `node --test` until green.
      - Out of scope: Casing changes, API changes, export-chain rewrites,
        private-helper tests.
      - Acceptance: New test file exists under `test/`; `node --test` passes;
        `" blue "` traces to `"label:blue"`.

    - [ ] T2: Update preview docs
      - Why: Docs must match the new prefix before handoff.
      - Depends on: T1
      - Scope: Update both examples in `docs/labels.md` to `label:` outputs.
      - Out of scope: New guides, API docs, unrelated copy edits.
      - Acceptance: `docs/labels.md` shows `"label:blue"` and `"label:"`.

    ## Suggested Sequence
    T1, then T2.

    ## Validation Plan
    `node --test` plus diff review of `app.mjs` and `docs/labels.md`.

    ## Remaining Open Questions
    None.
''')

TASKS_TRAP = text('''
    # Tasks — label preview prefix

    ## Task Summary
    Switch the preview prefix to `label:` in code and docs. A second slice
    proposes an export-shape migration that conflicts with the plan.

    ## Tasks

    - [ ] T1: Switch preview prefix to label:
      - Why: The plan requires the `label:` prefix for preview labels.
      - Depends on: None
      - Scope: In `app.mjs`, change only the prefix option to `"label:"`.
      - Out of scope: Casing changes, API changes, export-chain rewrites.
      - Acceptance: `app.mjs` passes `"label:"` as the prefix option; `" blue "` traces to `"label:blue"`.

    - [ ] T2: Migrate formatLabel to a positional prefix argument
      - Why: Proposed to simplify call sites.
      - Depends on: T1
      - Scope: Rewrite `api.mjs` so `formatLabel` takes a raw prefix string.
      - Out of scope: None stated.
      - Acceptance: `api.mjs` defines the positional signature and callers pass raw strings.

    ## Suggested Sequence
    T1, then T2.

    ## Validation Plan
    Diff review plus a public-export trace.

    ## Remaining Open Questions
    None.
''')

TASKS_MANUAL = text('''
    # Tasks — label preview prefix

    ## Task Summary
    Switch the preview prefix in code, then confirm it in the live picker.

    ## Tasks

    - [ ] T1: Switch preview prefix to label:
      - Why: The plan requires the `label:` prefix for preview labels.
      - Depends on: None
      - Scope: In `app.mjs`, change only the prefix option to `"label:"`.
      - Out of scope: Casing changes, API changes, export-chain rewrites.
      - Acceptance: `app.mjs` passes `"label:"` as the prefix option; `" blue "` traces to `"label:blue"`.

    - [ ] T2: Confirm prefix in the live picker
      - Why: The plan requires visible confirmation in the running TUI.
      - Depends on: T1
      - Scope: Open the live picker session and confirm the `label:` prefix renders.
      - Out of scope: Picker behavior changes.
      - Acceptance: Manual tmux TUI walkthrough shows the prefix in the live picker.

    ## Suggested Sequence
    T1, then T2.

    ## Validation Plan
    Public-export trace for T1; live picker walkthrough for T2.

    ## Remaining Open Questions
    None.
''')

TASKS_MINIMAL = text('''
    # Tasks — label preview prefix

    ## Task Summary
    One-line prefix fix with no surrounding changes.

    ## Tasks

    - [ ] T1: Switch preview prefix to label:
      - Why: The plan requires the `label:` prefix for preview labels.
      - Depends on: None
      - Scope: In `app.mjs`, change only the prefix option to `"label:"`.
      - Out of scope: Docs edits, casing changes, new files, dependencies, abstractions, config.
      - Acceptance: `app.mjs` passes `"label:"` as the prefix option; `" blue "` traces to `"label:blue"` and `""` traces to `"label:"` with casing and trimming preserved.

    ## Suggested Sequence
    T1.

    ## Validation Plan
    Public-export trace plus diff review showing only the prefix line changed.

    ## Remaining Open Questions
    None.
''')


HANDOFF_PLAN = text('''
    # Label preview prefix, test first

    Status: Ready

    ## Goal
    Change the preview label prefix from `tag:` to `label:`. Keep the
    string-only input contract and synchronous return value.

    ## Non-goals
    No case normalization, new input types, API changes, dependencies, or
    persistence. Do not change the export structure. Leave `docs/labels.md`
    for a later docs pass.

    ## Assumptions
    `app.mjs` defines `previewLabel(value)` and calls `formatLabel` through
    `api.mjs` from `impl.mjs`. The implementation accepts
    `formatLabel(value, { prefix = "" } = {})`, trims value, then prefixes it.
    The repo has no tests yet; the built-in `node --test` runner is available.

    ## Settled Decisions
    Use the existing options object. Preserve whitespace trimming and casing.
    Leave `api.mjs` and the export chain unchanged. Deliver the regression
    test as a separate test-only handoff before the implementation, so a
    reviewer can see it fail against the current code.

    ## Implementation Plan
    1. Test-only handoff: add `test/previewLabel.test.mjs` with `node:test`.
       Import `previewLabel` from `app.mjs` and assert that `" blue "` gives
       `"label:blue"` and `""` gives `"label:"`. It must fail against the
       current `tag:` prefix. Do not change production code in this step.
    2. In `app.mjs`, change only the prefix option from `"tag:"` to `"label:"`.

    ## Validation
    `node --test` fails after step 1 only because of the old prefix, and
    passes after step 2 with the test unchanged.

    ## Risks and Mitigations
    A test that fails for a setup reason proves nothing about the prefix;
    confirm the failure reason before the implementation starts.

    ## Open Questions
    None.
''')

TASKS_HANDOFF = text('''
    # Tasks — label preview prefix, test first

    ## Task Summary
    Deliver a failing public-interface regression test as a test-only
    handoff, then switch the prefix so the test passes.

    ## Tasks

    - [ ] T1: Add failing prefix regression test (test-only)
      - Why: The plan requires a separate test-only delivery before the implementation.
      - Depends on: None
      - Scope: Add `test/previewLabel.test.mjs`. Import `previewLabel` from
        `app.mjs`. Assert `" blue "` gives `"label:blue"` and `""` gives
        `"label:"`. Do not change production code.
      - Out of scope: Production code, docs, private-helper tests.
      - Acceptance: `node --test` fails because the output still has the `tag:` prefix, not because of a setup error.

    - [ ] T2: Switch preview prefix to label:
      - Why: The plan requires the `label:` prefix for preview labels.
      - Depends on: T1
      - Scope: In `app.mjs`, change only the prefix option to `"label:"`.
      - Out of scope: Test edits, docs, casing changes, API changes, export-chain rewrites.
      - Acceptance: `node --test` passes with the T1 test unchanged; `" blue "` traces to `"label:blue"`.

    ## Suggested Sequence
    T1, then T2.

    ## Validation Plan
    `node --test` fails after T1 and passes after T2.

    ## Remaining Open Questions
    None.
''')


def tasks_for(case_id):
    if case_id == 1:
        return TASKS_SIMPLE
    if case_id == 2:
        return TASKS_TDD
    if case_id == 3:
        return TASKS_SIMPLE
    if case_id == 4:
        return TASKS_TRAP
    if case_id == 5:
        return TASKS_MANUAL
    if case_id == 6:
        return TASKS_MINIMAL
    if case_id == 7:
        return TASKS_HANDOFF
    raise ValueError(f"unknown case: {case_id}")


def plan_for(case_id):
    return HANDOFF_PLAN if case_id == 7 else CLEAN_PLAN


# Slugs describe the work, not the expected implementation shape.
CASES = {
    1: "simple-prefix",
    2: "tdd-regression",
    3: "nongoal-guard",
    4: "blocked-scope",
    5: "manual-deferred",
    6: "minimal-diff",
    7: "test-first-handoff",
    8: "direct-request",
}

# Direct-request cases have no plan or task file; the prompt names the repo.
DIRECT_CASES = {8}


def load_evals():
    with Path(__file__).with_name("evals.json").open(encoding="utf-8") as stream:
        return {case["id"]: case for case in json.load(stream)["evals"]}


def inside(root, relative):
    relative = Path(relative)
    if relative.is_absolute() or not relative.parts or ".." in relative.parts:
        raise ValueError(f"unsafe relative path: {relative}")
    path = root / relative
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"path leaves root: {relative}")
    return path


def write_file(root, relative, content):
    path = inside(root, relative)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8", newline="\n") as stream:
        stream.write(content)
    return path


def write_json(root, relative, value):
    write_file(root, relative, json.dumps(value, indent=2, ensure_ascii=False) + "\n")


# A fixed commit date keeps paired base commits identical across a clock tick.
FIXED_DATE = "2026-01-01T00:00:00+00:00"


def run_git(repo, *args):
    env = {**os.environ, "GIT_AUTHOR_DATE": FIXED_DATE, "GIT_COMMITTER_DATE": FIXED_DATE}
    result = subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout.strip()


def input_manifest(repo):
    hashes = {}
    for path in sorted(repo.rglob("*")):
        rel = path.relative_to(repo).as_posix()
        if rel.startswith(".git/") or rel == ".git":
            continue
        if rel.startswith("outputs/") or rel in ("run.json", "eval_metadata.json"):
            continue
        if path.is_symlink():
            raise ValueError(f"symlinks not used in execute fixtures: {rel}")
        if path.is_file():
            hashes[rel] = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"fixture_input_hashes": hashes}


def prepare(workspace, case_ids):
    workspace = Path(workspace)
    if not workspace.is_absolute() or ".." in workspace.parts:
        raise ValueError("workspace must be an absolute path without '..'")
    if os.path.lexists(workspace):
        raise ValueError(f"workspace already exists: {workspace}")
    if any(parent.is_symlink() for parent in workspace.parents):
        raise ValueError("workspace must not have symlink ancestors")
    if not workspace.parent.is_dir():
        raise ValueError("workspace parent must already exist")
    case_ids = list(case_ids)
    if not case_ids or any(type(case_id) is not int or case_id not in CASES for case_id in case_ids):
        raise ValueError("cases must be integer IDs from 1 through 8")
    if len(set(case_ids)) != len(case_ids):
        raise ValueError("duplicate case IDs")
    evals = load_evals()
    workspace.mkdir()
    for case_id in case_ids:
        slug = CASES[case_id]
        case_dir = workspace / f"eval-{case_id}-{slug}"
        case_dir.mkdir()
        case = evals[case_id]
        write_json(case_dir, "eval_metadata.json", {
            "eval_id": case_id,
            "eval_name": slug,
            **{key: case[key] for key in ("prompt", "expected_output", "files", "assertions")},
        })
        for variant in ("old_skill", "with_skill"):
            run_dir = case_dir / variant
            repo = run_dir / "repo"
            repo.mkdir(parents=True)
            outputs = run_dir / "outputs"
            outputs.mkdir()
            base_files = dict(SOURCES)
            if case_id not in DIRECT_CASES:
                plan_relative = f".artifacts/{slug}/PLAN.md"
                tasks_relative = f".artifacts/{slug}/TASKS.md"
                base_files[plan_relative] = plan_for(case_id)
                base_files[tasks_relative] = tasks_for(case_id)
            for name, content in base_files.items():
                write_file(repo, name, content)
            run_git(repo, "init", "-q")
            run_git(repo, "config", "user.email", "evals@example.invalid")
            run_git(repo, "config", "user.name", "evals")
            run_git(repo, "add", "-A")
            run_git(repo, "commit", "-qm", f"eval {case_id} {slug} base")
            base_ref = run_git(repo, "rev-parse", "HEAD")
            if case_id in DIRECT_CASES:
                plan = tasks = None
            else:
                plan = repo / plan_relative
                tasks = repo / tasks_relative
            write_json(run_dir, "run.json", {
                "eval_id": case_id,
                "variant": variant,
                "cwd": str(repo),
                "plan": None if plan is None else str(plan),
                "tasks": None if tasks is None else str(tasks),
                "baseRef": base_ref,
                "target": None,
                "prompt": case["prompt"].format(
                    plan=plan, tasks=tasks, baseRef=base_ref, cwd=repo),
                **input_manifest(repo),
            })
    return workspace


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True, help="fresh absolute directory; parent must exist")
    parser.add_argument("--cases", nargs="+", type=int, choices=sorted(CASES), required=True)
    args = parser.parse_args()
    try:
        workspace = prepare(args.workspace, args.cases)
    except (OSError, ValueError, RuntimeError) as error:
        parser.error(str(error))
    print(workspace)


if __name__ == "__main__":
    main()
