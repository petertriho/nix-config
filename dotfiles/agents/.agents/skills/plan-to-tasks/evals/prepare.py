#!/usr/bin/env python3
"""Materialize paired, local-only plan-to-tasks fixtures. No agent execution."""

import argparse
import hashlib
import json
import os
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

NOGOAL_PLAN = CLEAN_PLAN.replace(
    "No case normalization, new input types, API changes, dependencies, or\npersistence.",
    "No case normalization to uppercase, new input types, API changes,\ndependencies, or persistence. An uppercase display was explicitly rejected\nin review.",
)

DRAFT_PLAN = text('''
    # Write the intake guide

    Status: Draft
    The heading decision Q1 is unresolved; this document records no approval
    for either option.

    ## Goal
    Prepare a short, local guide for exporting hand-authored label CSV.
    No application behavior changes.

    ## Non-goals
    No service integration, network requests, credentials, deployment, or
    implementation of an exporter.

    ## Assumptions
    `docs/labels.md` describes the local preview format used in examples.

    ## Settled Decisions
    Keep all work in a new `docs/import.md`. Preserve `docs/labels.md`
    unchanged.

    ## Implementation Plan
    1. After the owner answers Q1, create `docs/import.md` using that heading.
       Include exactly the sample lines `label` and `blue`, a final newline,
       UTF-8 encoding, and a link to `labels.md`.
    2. Add a compatibility paragraph explaining the unconfirmed Archive
       Intake premise. Do not present the example as tested against it.

    ## Validation
    Review the sample column and value, encoding instruction, relative link,
    chosen heading, and explicit compatibility qualification.

    ## Risks and Mitigations
    Readers might mistake the guide for a service guarantee; the qualification
    and review prevent that. Resolve Q1 before drafting, without guessing.

    ## Open Questions
    Q1 (blocker, affects step 1): Should the owner choose "Upload labels" or
    "Import labels"? Neither option is approved.
''')

ASSUMPTION_PLAN = CLEAN_PLAN.replace(
    "## Open Questions\nNone.",
    "## Open Questions\nNonblocker: preferred docs example wording (owner favors\nlowercase-first examples). Does not affect sequencing or cost.",
)

PARALLEL_PLAN = text('''
    # Prefix change plus standalone checklist

    Status: Ready

    ## Goal
    Change the preview prefix to `label:` and add a standalone operator
    checklist. The two slices touch disjoint files with no dependency
    between them.

    ## Non-goals
    No case normalization, API changes, dependencies, or persistence.

    ## Assumptions
    `app.mjs` holds the preview call; `docs/` holds preview documentation and
    accepts a new standalone page.

    ## Settled Decisions
    Use the existing options object. Keep slices independent.

    ## Implementation Plan
    1. In `app.mjs`, change only the prefix option from `"tag:"` to `"label:"`.
    2. Create `docs/checklist.md` with the five operator checks listed below;
       content is fully specified, no discovery needed.
       Checks: run review, trace both examples, confirm exports unchanged,
       confirm string-only inputs, file the note.
    3. Roll out both slices: verify prefix trace and checklist content, then
       record rollout in the release note draft.

    ## Validation
    Trace `" blue "` to `"label:blue"` for slice 1; review the five checklist
    lines for slice 2; rollout note references both slices.

    ## Risks and Mitigations
    Slices are disjoint by file; rollout ordering covers joint verification.

    ## Open Questions
    None.
''')

REVISED_PLAN = CLEAN_PLAN.replace(
    'Change the preview label prefix from `tag:` to `label:`.',
    'Change the preview label prefix from `tag:` to `tag/v2:`.',
) + text('''
    ## Handoff Notes
    Revision 2 supersedes the `label:` prefix target agreed earlier. Completed
    prefix work must be corrected to `tag/v2:`.
''')

EXISTING_TASKS = text('''
    # Tasks — label preview prefix

    ## Task Summary
    Switch the preview prefix to `label:` in code and docs.

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

    ## Suggested Sequence
    T1, then T2.

    ## Validation Plan
    Diff review of `app.mjs` and `docs/labels.md`.

    ## Remaining Open Questions
    None.
''')


def plan_text(case_id):
    if case_id in (1, 4):
        return CLEAN_PLAN
    if case_id == 2:
        return NOGOAL_PLAN
    if case_id == 3:
        return DRAFT_PLAN
    if case_id == 5:
        return ASSUMPTION_PLAN
    if case_id == 6:
        return REVISED_PLAN
    if case_id == 7:
        return None  # Missing plan; decoy lives elsewhere.
    if case_id == 8:
        return PARALLEL_PLAN
    raise ValueError(f"unknown case: {case_id}")


# Slugs describe the work, not the expected task shape.
CASES = {
    1: "prefix-tasks",
    2: "nongoal-guard",
    3: "blocked-question",
    4: "observable-acceptance",
    5: "explicit-assumption",
    6: "revised-tasks",
    7: "missing-plan",
    8: "parallel-safe",
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


def input_manifest(repo):
    hashes = {}
    for path in sorted(repo.rglob("*")):
        name = path.relative_to(repo).as_posix()
        if path.is_symlink():
            raise ValueError(f"symlinks not used in plan-to-tasks fixtures: {name}")
        if path.is_file():
            hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
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
            plan = inside(repo, plan_relative)
            plan.parent.mkdir(parents=True)
            files = dict(SOURCES)
            text_value = plan_text(case_id)
            if text_value is not None:
                files[plan_relative] = text_value
            if case_id == 6:
                files[f".artifacts/{slug}/TASKS.md"] = EXISTING_TASKS
            if case_id == 7:
                files[".artifacts/decoy/PLAN.md"] = CLEAN_PLAN
            for name, content in files.items():
                write_file(repo, name, content)
            if case_id == 7:
                prompt = case["prompt"].format(plan=plan)
                target = None
            elif case_id == 6:
                existing = str(repo / f".artifacts/{slug}/TASKS.md")
                prompt = case["prompt"].format(plan=plan, target=str(outputs / "TASKS.md"))
                prompt += f" Revise the existing task file at {existing}."
                target = str(outputs / "TASKS.md")
            else:
                prompt = case["prompt"].format(plan=plan, target=str(outputs / "TASKS.md"))
                target = str(outputs / "TASKS.md")
            write_json(run_dir, "run.json", {
                "eval_id": case_id,
                "variant": variant,
                "cwd": str(repo),
                "plan": str(plan),
                "target": target,
                "prompt": prompt,
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
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(workspace)


if __name__ == "__main__":
    main()
