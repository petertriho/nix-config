#!/usr/bin/env python3
"""Materialize paired, local-only plan-evaluate fixtures. No agent execution."""

import argparse
import hashlib
import json
import os
from pathlib import Path
from textwrap import dedent


def text(value):
    return dedent(value).strip() + "\n"


SOURCES = {
    "api.mjs": 'export { formatLabel } from "./links/current.mjs";\n',
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
SYMLINKS = {
    "links/next.mjs": "../impl.mjs",
    "links/current.mjs": "next.mjs",
}
CHECK_SCRIPT = text('''
    #!/bin/sh
    set -eu
    printf 'invoked\\n' > "$(dirname "$0")/../.check-invoked"
    case "${1-}" in
      --help)
        printf '%s\\n' 'Usage: scripts/check --help'
        exit 0
        ;;
      *)
        printf '%s\\n' 'Expected --help' >&2
        exit 2
        ;;
    esac
''')
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
    `app.mjs` exports `previewLabel(value)` and calls `formatLabel` through
    `api.mjs`. That module re-exports through `links/current.mjs`, a symlink
    to `next.mjs`, which links to `../impl.mjs`. The implementation accepts
    `formatLabel(value, { prefix = "" } = {})`, trims value, then prefixes it.
    `docs/labels.md` documents the current preview.

    ## Settled Decisions
    Use the existing options object. Preserve whitespace trimming and casing.

    ## Implementation Plan
    1. In `app.mjs`, change only the prefix option from `"tag:"` to `"label:"`.
    2. In `docs/labels.md`, replace the documented prefix and update the two
       examples to `"label:blue"` and `"label:"`; retain the string-input rule.

    ## Validation
    Review the diff and trace `" blue "` and `""` through the public export
    to confirm those exact outputs. Check that no other source changes occur.
    No executable validation command is required.

    ## Risks and Mitigations
    Accidentally changing casing or trimming would break existing semantics;
    the spaced, lowercase example and unchanged implementation check cover both.

    ## Open Questions
    None.
''')

# Slugs describe the work, not the expected verdict. None means a missing plan.
CASES = {
    1: ("prefix-preview", CLEAN_PLAN),
    2: ("preview-refresh", text('''
        # Refresh preview labels

        Status: Ready

        ## Goal
        Adopt the `label:` preview prefix while keeping the public exports,
        synchronous return, and string-only inputs.

        ## Non-goals
        Case normalization is out of scope: preserve caller casing. No new
        input types, API changes, persistence, or dependencies.

        ## Assumptions
        Verified: `api.mjs` exports `formatLabel` through `links/current.mjs`,
        then `links/next.mjs`, finally `impl.mjs`. Its signature is
        `formatLabel(value, prefix = "")`: the second argument is a raw prefix
        string, not an options object. `app.mjs` contains the preview wrapper;
        `docs/labels.md` contains its usage examples.

        ## Settled Decisions
        The approved prefix is `label:`. Keep the implementation synchronous
        and retain the existing export chain and whitespace trimming.

        ## Implementation Plan
        1. In `app.mjs`, replace the preview call with
           `formatLabel(value, "label:")`, relying on the verified signature.
        2. In `impl.mjs`, uppercase value before trimming and prefixing it.
        3. Update `docs/labels.md` to describe the new prefix and uppercase
           output; show `" blue "` becoming `"label:BLUE"` and `""` becoming
           `"label:"`.

        ## Validation
        Review the changed call, trace both documented examples through the
        implementation, and compare the results with the documentation.
        Confirm exports and string-only inputs stay unchanged.

        ## Risks and Mitigations
        Empty strings must retain the prefix; the empty example covers this.
        The diff review checks that no unrelated interfaces change.

        ## Open Questions
        None.
    ''')),
    3: ("intake-guide", text('''
        # Write the intake guide

        Status: Draft
        The heading decision Q1 is unresolved and the external CSV premise
        is unverified; this document does not record approval for either.

        ## Goal
        Prepare a short, local guide for exporting hand-authored label CSV.
        No application behavior changes.

        ## Non-goals
        No service integration, network requests, credentials, deployment, or
        implementation of an exporter.

        ## Assumptions
        `docs/labels.md` describes the local preview. Unverified: the separately
        managed Archive Intake service accepts UTF-8 CSV with one `label`
        column. This repository supplies neither its contract nor access.

        ## Settled Decisions
        Keep all work in a new `docs/import.md`. Preserve `docs/labels.md`
        unchanged and label the service compatibility premise as unconfirmed.

        ## Implementation Plan
        1. After the owner answers Q1, create `docs/import.md` using that heading.
           Include exactly the sample lines `label` and `blue`, a final newline,
           UTF-8 encoding, and a link to `labels.md`.
        2. Add a compatibility paragraph explaining the unconfirmed Archive
           Intake premise. Do not present the example as tested against it.

        ## Validation
        Review the sample column and value, encoding instruction, relative
        link, chosen heading, and explicit compatibility qualification.
        Source review is sufficient; no external check is requested.

        ## Risks and Mitigations
        Readers might mistake the guide for a service guarantee; the qualification
        and review prevent that. Resolve Q1 before drafting, without guessing.

        ## Open Questions
        Q1: Should the owner choose “Upload labels” or “Import labels”?
        Neither option is approved.
    ''')),
    4: ("preview-check", text('''
        # Prefix change with a local check

        Status: Ready

        ## Goal
        Switch preview labels to `label:` and provide a repeatable check.

        ## Non-goals
        No API changes, new input types, dependencies, or casing changes.
        Keep the existing export chain and trimming behavior.

        ## Assumptions
        `app.mjs` imports the public `formatLabel` export from `api.mjs`.
        Following its linked re-export reaches `impl.mjs`, whose second
        argument is an options object with a `prefix` property.
        `docs/labels.md` describes the current preview.

        ## Settled Decisions
        Use the existing API and built-in assertions only. Validation script
        creation is planned work, not a claim that it already exists.

        ## Implementation Plan
        1. Change the prefix option in `app.mjs` to `"label:"` and update both
           examples in `docs/labels.md` to `"label:blue"` and `"label:"`.
        2. Create `scripts/check.mjs`. Import `strict as assert` from
           `node:assert` and `previewLabel` from `../app.mjs`; assert that
           `" blue "` returns `"label:blue"` and `""` returns `"label:"`.
        3. After Step 2, run `node scripts/check.mjs` if a Node runtime is
           provisioned. Otherwise use the review acceptance below.

        ## Validation
        Inspect the assertions and trace both inputs through the implementation.
        This is sufficient acceptance without assuming any runtime is installed;
        a provisioned runtime additionally permits the new script to be run.

        ## Risks and Mitigations
        Prefix loss and trimming regressions are covered by the two exact
        output checks. Review the diff for unintended changes to casing.

        ## Open Questions
        None.
    ''')),
    5: ("display-convention", text('''
        # Apply the agreed display convention

        Status: Ready

        ## Goal
        Use `label:` and uppercase text in the desired preview display,
        with a synchronous, string-only interface.

        ## Non-goals
        No changes to the export structure, accepted input types, dependencies,
        storage, or whitespace trimming.

        ## Settled Decisions
        D1: The existing `formatLabel` implementation already converts value
        to uppercase before prefixing it. Preserve that existing behavior;
        this premise is why the caller needs only a prefix change.
        The desired uppercase display and `label:` prefix are approved.

        ## Assumptions
        `app.mjs` defines `previewLabel`; `api.mjs` exposes `formatLabel`
        through `links/current.mjs` and `links/next.mjs` to `impl.mjs`.
        `docs/labels.md` is the preview's documentation.

        ## Implementation Plan
        1. Relying on D1, change only the `"tag:"` string in `app.mjs` to
           `"label:"`. Keep the call shape, arguments, and implementation
           otherwise identical; add no caller-side casing conversion.
        2. Update `docs/labels.md` for the agreed display, showing `" blue "`
           as `"label:BLUE"` and `""` as `"label:"`. Retain the string-only rule.

        ## Validation
        Review the prefix-only source diff, follow the public export, and
        trace both documented examples to confirm the exact desired outputs.
        Review-based acceptance needs no runtime or service.

        ## Risks and Mitigations
        A prefix change could accidentally disturb empty-input handling;
        the empty example checks it. Comparing both examples with the source
        catches documentation drift.

        ## Open Questions
        None.
    ''')),
    6: ("revised-preview", text('''
        # Revise the preview prefix

        Status: Ready

        ## Revision Authority
        Revision 2 below supersedes every decision, implementation step, and
        validation instruction in Archived Revision 1. The archive is history
        only, not current requirements or claims about existing behavior.

        ## Archived Revision 1 — superseded
        Decision: normalize labels to uppercase.
        Old steps: add uppercase conversion in `impl.mjs`; document uppercase
        results in `docs/labels.md`.
        Old validation: expect `" blue "` to display as `"tag:BLUE"`.

        ## Goal — Revision 2
        Change only the preview prefix from `tag:` to `label:`.

        ## Non-goals — Revision 2
        No uppercase conversion, API changes, new dependencies, or new input
        types. The archive does not authorize any extra implementation.

        ## Assumptions
        `app.mjs` calls the public export in `api.mjs`. Its symlink chain ends
        at `impl.mjs`, which trims value and accepts a prefix options object.
        `docs/labels.md` holds the current examples.

        ## Settled Decisions — Revision 2
        Preserve input casing, whitespace trimming, and string-only inputs.
        Leave `impl.mjs` and the export chain unchanged.

        ## Implementation Plan — Revision 2
        1. In `app.mjs`, change the existing prefix option to `"label:"`.
        2. In `docs/labels.md`, change the two outputs to `"label:blue"` and
           `"label:"` and describe the new prefix without changing other rules.

        ## Validation — Revision 2
        Review the diff and trace `" blue "` and `""` to those exact outputs.
        Confirm only the two named files change; no command execution is needed.

        ## Risks and Mitigations
        The lowercase, spaced input checks casing and trimming preservation.
        The empty input checks prefix retention.

        ## Open Questions
        None.
    ''')),
    7: ("plan-input", ""),
    8: ("requested-review", None),
    9: ("requested-review-no-target", None),
    10: ("preview-notes", CLEAN_PLAN.replace("Status: Ready\n\n", "")),
    11: ("helper-guide", text('''
        # Document the local helper

        Status: Ready

        ## Goal
        Add a short reference for the existing `scripts/check --help`
        interface, without changing the helper or application.

        ## Non-goals
        No executable changes, runtime setup, new commands, dependencies,
        integrations, or cleanup of helper-generated files.

        ## Assumptions
        `scripts/check` is a local shell script. Its help branch prints
        `Usage: scripts/check --help` and exits successfully. The repository
        also contains the preview documentation at `docs/labels.md`.

        ## Settled Decisions
        Create only `docs/check.md`. Document the helper as it exists, including
        local side effects observed in its source; do not redesign it.

        ## Implementation Plan
        1. Inspect `scripts/check` and write `docs/check.md` with the invocation
           `scripts/check --help`, the exact usage line, and exit status zero.
        2. Describe its `.check-invoked` marker in the repository root, written
           before argument processing, and link to `labels.md` for the separate
           preview feature. Explain that the marker contains `invoked` followed
           by a newline and is overwritten on each invocation.

        ## Validation
        Compare the guide with the script's statements and help branch in
        source, including execution order, output, and exit status. Review
        the relative link and confirm the diff adds only the documentation.
        Executing the helper is unnecessary for this documentation acceptance.

        ## Risks and Mitigations
        Readers might assume help has no side effects. The explicit marker
        warning and source-order review prevent that mistaken expectation.

        ## Open Questions
        None.
    ''')),
}


def load_evals():
    with Path(__file__).with_name("evals.json").open(encoding="utf-8") as stream:
        return {case["id"]: case for case in json.load(stream)["evals"]}


def inside(root, relative):
    """Reject traversal and writes through links that leave the fixture root."""
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
    """Inventory relative names, regular-file SHA-256s, and raw link targets."""
    hashes, links = {}, {}
    for path in sorted(repo.rglob("*")):
        name = path.relative_to(repo).as_posix()
        if path.is_symlink():
            target = os.readlink(path)
            if Path(target).is_absolute() or not path.resolve(strict=True).is_relative_to(repo.resolve()):
                raise ValueError(f"symlink leaves fixture: {name}")
            links[name] = target
        elif path.is_file():
            hashes[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"fixture_input_hashes": hashes, "symlink_targets": links}


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
        raise ValueError("cases must be integer IDs from 1 through 11")
    if len(set(case_ids)) != len(case_ids):
        raise ValueError("duplicate case IDs")
    evals = load_evals()
    workspace.mkdir()  # Exclusive creation; never merge into an existing run.
    for case_id in case_ids:
        slug, plan_text = CASES[case_id]
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
            if plan_text is not None:
                files[plan_relative] = plan_text
            if case_id == 8:
                files[".artifacts/decoy/PLAN.md"] = CLEAN_PLAN
            if case_id == 11:
                files["scripts/check"] = CHECK_SCRIPT
            for name, content in files.items():
                path = write_file(repo, name, content)
                if name == "scripts/check":
                    path.chmod(0o755)
            for name, target in SYMLINKS.items():
                link = inside(repo, name)
                link.parent.mkdir(parents=True, exist_ok=True)
                link.symlink_to(target)
            target = None if case_id == 9 else str(outputs / "EVALUATION.md")
            write_json(run_dir, "run.json", {
                "eval_id": case_id,
                "variant": variant,
                "cwd": str(repo),
                "plan": str(plan),
                "target": target,
                "prompt": case["prompt"].format(plan=plan, target=target),
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
