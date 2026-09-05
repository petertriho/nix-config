"""Offline fresh-fixture validation; no model calls and no fixture mutations."""
import argparse
import json
from pathlib import Path

from backend import dispatch
from build_fixtures import SCENARIOS, conditions, save, snapshot


def validate(workspace):
    rows = []
    for case in json.loads((workspace / "evals.json").read_text())["evals"]:
        states = []
        for version in conditions(workspace):
            run = workspace / "runs" / f"eval-{case['id']}" / version
            actual = snapshot(run / "fixture")
            initial = json.loads((run / "initial-state.json").read_text())
            if actual != initial:
                raise ValueError(f"Fixture changed since construction: {run}")
            if not set(SCENARIOS[case["id"]]) <= actual["files"].keys():
                raise ValueError(f"Missing scenario inputs: {run}")
            if not dispatch(run, version, "fixture_read", {"path": "skill/SKILL.md"}):
                raise ValueError("Empty assigned skill")
            states.append(actual)
        for key in ("files", "directories", "symlinks", "index_entries", "cached_diff", "worktree_diff", "status"):
            if any(states[0][key] != state[key] for state in states[1:]):
                raise ValueError(f"Paired fixture mismatch: {case['id']}, {key}")
        rows.append({"scenario": case["id"], "conditions": list(conditions(workspace)),
                     "paired_equivalent": True if len(states) == 2 else None})
    save(workspace / "fixture-validation.json", rows)
    return rows


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", required=True, type=lambda p: Path(p).resolve())
    print(json.dumps(validate(parser.parse_args().workspace), indent=2))
