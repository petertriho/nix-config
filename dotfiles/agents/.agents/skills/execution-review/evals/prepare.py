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
}


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


def run_git(repo, *args):
    result = subprocess.run(
        ["git", *args],
        cwd=repo,
        capture_output=True,
        text=True,
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
            plan_relative = f".artifacts/{slug}/PLAN.md"
            tasks_relative = f".artifacts/{slug}/TASKS.md"
            plan_text = CLEAN_PLAN
            tasks = tasks_text(case_id, slug)
            # Base commit: sources plus plan, plus tasks when present.
            base_files = dict(BASE_SOURCES)
            base_files[plan_relative] = plan_text
            if tasks is not None:
                base_files[tasks_relative] = tasks
            if case_id == 5:
                base_files[".artifacts/decoy/PLAN.md"] = CLEAN_PLAN
                base_files[".artifacts/decoy/TASKS.md"] = TASKS_CLEAN_CHECKED
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
                target = repo / name
                target.write_text(content, encoding="utf-8", newline="\n")
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
