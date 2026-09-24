#!/usr/bin/env python3
"""Materialize paired, local-only execution-review fixtures. No agent execution."""

import argparse
import hashlib
import json
import os
import subprocess
from pathlib import Path
from textwrap import dedent


def text(value):
    return dedent(value).strip() + "\n"


BASE_SOURCES = {
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
    Confirm `node --test` passes when a runtime is provisioned.

    ## Risks and Mitigations
    Accidentally changing casing or trimming would break existing semantics;
    the spaced, lowercase example and unchanged implementation check cover both.

    ## Open Questions
    None.
''')

TASKS_CLEAN_CHECKED = text('''
    # Tasks — label preview prefix

    ## Task Summary
    Switch the preview prefix to `label:` in code and docs, then run the
    narrowest automated check.

    ## Tasks

    - [x] T1: Switch preview prefix to label:
      - Why: The plan requires the `label:` prefix for preview labels.
      - Depends on: None
      - Scope: In `app.mjs`, change only the prefix option to `"label:"`.
      - Out of scope: Casing changes, API changes, export-chain rewrites.
      - Acceptance: `app.mjs` passes `"label:"` as the prefix option; `" blue "` traces to `"label:blue"`.

    - [x] T2: Update preview docs and run checks
      - Why: Docs must match the new prefix before handoff.
      - Depends on: T1
      - Scope: Update both examples in `docs/labels.md` to `label:` outputs.
      - Out of scope: New guides, API docs, unrelated copy edits.
      - Acceptance: `docs/labels.md` shows `"label:blue"` and `"label:"`; review of the two-file diff shows no other source change.

    ## Suggested Sequence
    T1, then T2.

    ## Validation Plan
    Diff review of `app.mjs` and `docs/labels.md` plus `node --test` when provisioned.

    ## Remaining Open Questions
    None.
''')

TASKS_MANUAL_UNVERIFIED = TASKS_CLEAN_CHECKED.replace(
    "Acceptance: `docs/labels.md` shows `\"label:blue\"` and `\"label:\"`; review of the two-file diff shows no other source change.",
    "Acceptance: `docs/labels.md` shows `\"label:blue\"` and `\"label:\"`; manual tmux TUI walkthrough shows the prefix in the live picker.",
)

TASKS_DEFERRED_T2 = text('''
    # Tasks — label preview prefix

    ## Task Summary
    Switch the code prefix now; docs follow as a corrective task.

    ## Tasks

    - [x] T1: Switch preview prefix to label:
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
      - Validation note: Deferred; docs edit blocked on owner wording sign-off.

    ## Suggested Sequence
    T1, then T2.

    ## Validation Plan
    Diff review of `app.mjs` plus docs review when T2 lands.

    ## Remaining Open Questions
    None.
''')

FIX_CLEAN = {
    "app.mjs": text('''
        import { formatLabel } from "./api.mjs";

        export function previewLabel(value) {
          return formatLabel(value, { prefix: "label:" });
        }
    '''),
    "docs/labels.md": text('''
        # Label preview

        The preview adds `label:` to a whitespace-trimmed label.
        `" blue "` displays as `"label:blue"`; `""` displays as `"label:"`.
        Input is a string. Casing is preserved.
    '''),
}

FIX_NOGOAL_UPPER = dict(
    FIX_CLEAN,
    **{
        "impl.mjs": text('''
            export function formatLabel(value, { prefix = "" } = {}) {
              return `${prefix}${value.trim().toUpperCase()}`;
            }
        '''),
    },
)

FIX_REVERSED_EXPORTS = dict(
    FIX_CLEAN,
    **{
        "api.mjs": text('''
            export function formatLabel(value, prefix = "") {
              return `${prefix}${String(value).trim()}`;
            }
        '''),
    },
)


REVISED_PLAN = text("""
    # Label preview prefix

    Status: Ready (Revision 1, 2026-09-18)

    ## Goal
    Change the preview label prefix from `tag:` to `lbl:`. Keep the
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

    Revision 1 (2026-09-18): Use `lbl:` instead of `label:`. The picker column
    shows 12 characters, and `label:` cut off real labels. This revision
    replaces the earlier `label:` prefix in code and docs.

    ## Implementation Plan
    1. In `app.mjs`, change only the prefix option from `"tag:"` to `"lbl:"`.
    2. In `docs/labels.md`, replace the documented prefix and update the two
       examples to `"lbl:blue"` and `"lbl:"`; retain the string-input rule.

    ## Validation
    Review the diff and trace `" blue "` and `""` through the public export
    to confirm those exact outputs. Check that no other source changes occur.
    Confirm `node --test` passes when a runtime is provisioned.

    ## Risks and Mitigations
    Accidentally changing casing or trimming would break existing semantics;
    the spaced, lowercase example and unchanged implementation check cover both.

    ## Open Questions
    None.
""")

TASKS_REVISED = TASKS_CLEAN_CHECKED.replace(
    "Switch the preview prefix to `label:` in code and docs, then run the\nnarrowest automated check.",
    "Switch the preview prefix in code and docs. Plan Revision 1 replaced\n`label:` with `lbl:`; T3 applies the correction.",
).replace(
    "\n## Suggested Sequence\nT1, then T2.",
    text("""
        - [x] T3: Switch preview prefix to lbl:
          - Why: PLAN.md Revision 1 replaces `label:` with `lbl:`. Supersedes the `label:` criteria in the T1 acceptance and the `"label:blue"` and `"label:"` criteria in the T2 acceptance.
          - Depends on: T1, T2
          - Scope: In `app.mjs` and `docs/labels.md`, change `label:` to `lbl:`.
          - Out of scope: Casing changes, API changes, export-chain rewrites.
          - Acceptance: `app.mjs` passes `"lbl:"` as the prefix option; `" blue "` traces to `"lbl:blue"`; `docs/labels.md` shows `"lbl:blue"` and `"lbl:"`.

        ## Suggested Sequence
        T1, T2, then T3.
    """).rstrip("\n").join(["\n", ""]),
)

HANDOFF_PLAN = text("""
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
""")

TASKS_HANDOFF = text("""
    # Tasks — label preview prefix, test first

    ## Task Summary
    Deliver a failing regression test as a test-only handoff, then switch the
    prefix.

    ## Tasks

    - [x] T1: Add failing previewLabel regression test (test-only handoff)
      - Why: The plan requires a test-only handoff that fails against the current `tag:` prefix.
      - Depends on: None
      - Scope: Add `test/previewLabel.test.mjs` with `node:test`; assert `" blue "` gives `"label:blue"` and `""` gives `"label:"`. No production code changes.
      - Out of scope: Production code, docs, other tests.
      - Acceptance: Before `app.mjs` changes, `node --test` fails only because `previewLabel` returns `tag:` outputs instead of `label:` outputs.
      - Handoff evidence: Added the test and ran the tests. They failed as expected.

    - [x] T2: Switch preview prefix to label:
      - Why: The plan requires the `label:` prefix for preview labels.
      - Depends on: T1
      - Scope: In `app.mjs`, change only the prefix option to `"label:"`.
      - Out of scope: Test edits, docs, casing changes, API changes, export-chain rewrites.
      - Acceptance: `node --test` passes; `app.mjs` passes `"label:"` as the prefix option.

    ## Suggested Sequence
    T1, then T2.

    ## Validation Plan
    `node --test` fails after T1 for the prefix reason only and passes after T2.

    ## Remaining Open Questions
    None.
""")

HANDOFF_TEST = text("""
    import { test } from "node:test";
    import assert from "node:assert/strict";
    import { previewLabel } from "../app.mjs";

    test("previewLabel uses the label: prefix", () => {
      assert.equal(previewLabel(" blue "), "label:blue");
      assert.equal(previewLabel(""), "label:");
    });
""")

DOCS_REFRESH_PLAN = text("""
    # Label docs refresh

    Status: Ready

    ## Goal
    Add an `## Examples` section to `docs/labels.md` with three worked inputs.

    ## Non-goals
    No source changes.

    ## Implementation Plan
    1. Add `## Examples` with `" blue "`, `""`, and `" Blue "`.

    ## Validation
    Read `docs/labels.md`.

    ## Open Questions
    None.
""")

DOCS_REFRESH_TASKS = text("""
    # Tasks — label docs refresh

    ## Tasks

    - [x] T1: Add label examples section
      - Why: The plan requires worked examples in the docs.
      - Depends on: None
      - Scope: Add `## Examples` to `docs/labels.md`.
      - Out of scope: Source changes.
      - Acceptance: `docs/labels.md` has an `## Examples` section that shows `" blue "`, `""`, and `" Blue "`.

    ## Suggested Sequence
    T1.

    ## Validation Plan
    Docs review.

    ## Remaining Open Questions
    None.
""")

CASING_FOLLOWUP_PLAN = text("""
    # Optional label casing

    Status: Draft

    ## Goal
    Add an optional `casing` option to `formatLabel`.

    ## Open Questions
    Should the default stay `preserve`?
""")

# Case 11 directories and modification times: the newest directory has no
# TASKS.md, so the selected pair is the middle one.
IMPLICIT_ARTIFACTS = {
    "docs-refresh": ({"PLAN.md": DOCS_REFRESH_PLAN, "TASKS.md": DOCS_REFRESH_TASKS}, 1786000000),
    "prefix-rollout": ({"PLAN.md": CLEAN_PLAN, "TASKS.md": TASKS_CLEAN_CHECKED}, 1788000000),
    "casing-followup": ({"PLAN.md": CASING_FOLLOWUP_PLAN}, 1789000000),
}


def impl_overlay(case_id):
    """Worktree source changes applied after the base commit, before review."""
    if case_id == 1:
        return dict(FIX_CLEAN)
    if case_id == 2:
        return {}  # Still tag:: T1 checked but not implemented.
    if case_id == 3:
        return dict(FIX_NOGOAL_UPPER)
    if case_id == 4:
        return dict(FIX_REVERSED_EXPORTS)
    if case_id == 5:
        return dict(FIX_CLEAN)
    if case_id == 6:
        return dict(FIX_CLEAN)
    if case_id == 7:
        return dict(FIX_CLEAN)
    if case_id == 8:
        return {"app.mjs": FIX_CLEAN["app.mjs"]}  # Docs deferred by design.
    if case_id == 9:
        return {
            name: content.replace("label:", "lbl:")
            for name, content in FIX_CLEAN.items()
        }
    if case_id == 10:
        return {"app.mjs": FIX_CLEAN["app.mjs"], "test/previewLabel.test.mjs": HANDOFF_TEST}
    if case_id == 11:
        return dict(FIX_CLEAN)
    raise ValueError(f"unknown case: {case_id}")


def tasks_text(case_id, slug):
    if case_id in (1, 2, 3, 4, 7):
        return TASKS_CLEAN_CHECKED
    if case_id == 5:
        return None  # Missing TASKS.md; decoy lives elsewhere.
    if case_id == 6:
        return TASKS_MANUAL_UNVERIFIED
    if case_id == 8:
        return TASKS_DEFERRED_T2
    if case_id == 9:
        return TASKS_REVISED
    if case_id == 10:
        return TASKS_HANDOFF
    if case_id == 11:
        return TASKS_CLEAN_CHECKED  # Selected pair; see IMPLICIT_ARTIFACTS.
    raise ValueError(f"unknown case: {case_id}")


# Slugs describe the work, not the expected verdict.
CASES = {
    1: "clean-pass",
    2: "checked-not-met",
    3: "non-goal-built",
    4: "decision-reversed",
    5: "missing-tasks",
    6: "manual-unverified",
    7: "unplanned-scope",
    8: "deferred-docs",
    9: "prefix-revision",
    10: "test-first-prefix",
    11: "prefix-rollout",
}


def plan_text(case_id):
    if case_id == 9:
        return REVISED_PLAN
    if case_id == 10:
        return HANDOFF_PLAN
    return CLEAN_PLAN


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
    """Inventory worktree names and SHA-256s, excluding .git, outputs, and records."""
    hashes = {}
    for path in sorted(repo.rglob("*")):
        rel = path.relative_to(repo).as_posix()
        if rel.startswith(".git/") or rel == ".git":
            continue
        if rel.startswith("outputs/") or rel in ("run.json", "eval_metadata.json"):
            continue
        if path.is_symlink():
            raise ValueError(f"symlinks not used in execution-review fixtures: {rel}")
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
        raise ValueError(f"cases must be integer IDs from 1 through {max(CASES)}")
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
            plan_relative = f".artifacts/{slug}/PLAN.md"
            tasks_relative = f".artifacts/{slug}/TASKS.md"
            tasks = tasks_text(case_id, slug)
            # Base commit: sources plus plan, plus tasks when present.
            base_files = dict(BASE_SOURCES)
            base_files[plan_relative] = plan_text(case_id)
            if tasks is not None:
                base_files[tasks_relative] = tasks
            if case_id == 5:
                base_files[".artifacts/decoy/PLAN.md"] = CLEAN_PLAN
                base_files[".artifacts/decoy/TASKS.md"] = TASKS_CLEAN_CHECKED
            if case_id == 11:
                for directory, (files, _) in IMPLICIT_ARTIFACTS.items():
                    for name, content in files.items():
                        base_files[f".artifacts/{directory}/{name}"] = content
            for name, content in base_files.items():
                write_file(repo, name, content)
            run_git(repo, "init", "-q")
            run_git(repo, "config", "user.email", "evals@example.invalid")
            run_git(repo, "config", "user.name", "evals")
            run_git(repo, "add", "-A")
            run_git(repo, "commit", "-qm", f"eval {case_id} {slug} base")
            base_ref = run_git(repo, "rev-parse", "HEAD")
            # Worktree implementation overlay: uncommitted changes under review.
            for name, content in impl_overlay(case_id).items():
                target = inside(repo, name)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8", newline="\n")
            if case_id == 11:
                for directory, (files, stamp) in IMPLICIT_ARTIFACTS.items():
                    folder = repo / ".artifacts" / directory
                    for name in files:
                        os.utime(folder / name, (stamp, stamp))
                    os.utime(folder, (stamp, stamp))
            plan = repo / plan_relative
            tasks_path = repo / tasks_relative
            target = str(outputs / "REVIEW.md")
            write_json(run_dir, "run.json", {
                "eval_id": case_id,
                "variant": variant,
                "cwd": str(repo),
                "plan": str(plan),
                "tasks": str(tasks_path),
                "target": target,
                "baseRef": base_ref,
                "prompt": case["prompt"].format(
                    plan=plan,
                    tasks=tasks_path,
                    target=target,
                    baseRef=base_ref,
                ),
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
