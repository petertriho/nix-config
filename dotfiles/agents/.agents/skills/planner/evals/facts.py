#!/usr/bin/env python3
"""Record mechanical facts for completed planner runs. Not a grader."""

import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path

from prepare import CASES, git, input_manifest

SECTIONS = ["Goal", "Non-goals", "Assumptions", "Settled Decisions", "Proposed Approach",
            "Implementation Plan", "Validation", "Risks and Mitigations", "Handoff Notes",
            "Open Questions", "Task Tracking"]


def section_order(plan):
    found = []
    for line in plan.splitlines():
        match = re.match(r"^#{2,3}\s+(?:\d+\.\s*)?(.+?)\s*$", line)
        if not match:
            continue
        name = match.group(1).rstrip(":").lower()
        found += [s for s in SECTIONS if name == s.lower() or name.startswith(s.lower() + " ")]
    indexes = [SECTIONS.index(s) for s in found]
    return found, indexes == sorted(indexes) and len(set(found)) == len(found)


def plan_facts(repo, relative):
    plan = (repo / relative).read_text(encoding="utf-8")
    lines = plan.splitlines()
    status = next((i for i, line in enumerate(lines) if re.match(r"^\**Status\**:", line.strip())), None)
    order, in_order = section_order(plan)
    note = next((i for i, line in enumerate(lines) if re.match(r"^>\s*\*\*Tasks:\*\*", line)), None)
    return {
        "path": relative,
        "status_line": lines[status].strip() if status is not None else None,
        "lines_after_status": lines[status + 1:status + 4] if status is not None else [],
        "tasks_note_offset": note - status if None not in (note, status) else None,
        "has_tracking_template": bool(re.search(r"^\s*## Tracking\s*$", plan, re.M)),
        "skill_paths": re.findall(r"\S*(?:\.agents/skills|\.claude/skills|tasks-format\.md)\S*", plan),
        "sections": order,
        "sections_in_order": in_order,
        "missing_sections": [s for s in SECTIONS if s not in order],
    }


TASK_LINE = re.compile(r"^\s*- \[([ x~])\] (T\d+):", re.M)


def kept_in_order(original, current):
    """Return True when every line of original is still in current, in the same order."""
    remaining = iter(current.splitlines())
    return all(line in remaining for line in original.splitlines())


def tasks_facts(repo, relative, original=None):
    tasks = (repo / relative).read_text(encoding="utf-8")
    facts = {
        "path": relative,
        "has_tracking": bool(re.search(r"^#{2,3}\s+Tracking\s*$", tasks, re.M)),
        "tasks": [{"id": task_id, "state": state} for state, task_id in TASK_LINE.findall(tasks)],
        "blocked_by_fields": len(re.findall(r"^\s*- Blocked by:", tasks, re.M)),
        "supersedes": re.findall(r"^\s*- Supersedes:\s*(.+?)\s*$", tasks, re.M),
    }
    if original is not None:
        facts["original_lines_kept_in_order"] = kept_in_order(original, tasks)
    return facts


def response_facts(response):
    # Regex hits are leads, not verdicts: "I did not call ExitPlanMode" also matches.
    return {
        "exists": bool(response),
        "plan_lines": re.findall(r"^`?PLAN: (/[^`\n]+)`?\s*$", response, re.M),
        "tasks_lines": re.findall(r"^`?TASKS: (/[^`\n]+)`?\s*$", response, re.M),
        "status_values": re.findall(r"Status: (Ready|Draft)", response),
        "blockers_none": "Blockers: None" in response,
        "ask_user_question_mentions": len(re.findall(r"AskUserQuestion", response)),
        "plan_mode_tool_mentions": re.findall(r"(?:Enter|Exit)PlanMode", response),
        "question_marks": response.count("?"),
    }


def run_facts(run_dir):
    """Compare a run with its run.json baseline, write facts.json, and copy saved plans to outputs/."""
    run = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    repo, outputs = Path(run["cwd"]), Path(run["outputs"])
    before = run["fixture_input_hashes"]
    after = input_manifest(repo)["fixture_input_hashes"]
    changed = sorted(k for k in before.keys() & after.keys() if before[k] != after[k])
    added = sorted(after.keys() - before.keys())
    deleted = sorted(before.keys() - after.keys())
    artifact = lambda path: path.startswith(".artifacts/")
    try:
        head = git(repo, "rev-parse", "HEAD")
    except subprocess.CalledProcessError:
        head = None
    plans = [p for p in added + changed if artifact(p) and p.endswith("/PLAN.md")]
    tasks = [p for p in added + changed if artifact(p) and p.endswith("/TASKS.md")]
    fixtures = CASES[int(run_dir.parent.name.split("-")[1])].get("extras", {})
    facts = {
        "source_unchanged": not [p for p in changed + added + deleted if not artifact(p)],
        "non_artifact_changes": [p for p in changed + added + deleted if not artifact(p)],
        "artifact_added": [p for p in added if artifact(p)],
        "artifact_changed": [p for p in changed if artifact(p)],
        "artifact_deleted": [p for p in deleted if artifact(p)],
        "head_unchanged": head == run["fixture_head"],
        "plans": [plan_facts(repo, p) for p in plans],
        "tasks": [tasks_facts(repo, p, fixtures.get(p)) for p in tasks],
    }
    for group in (plans, tasks):
        for relative in group:
            name = Path(relative).name if len(group) == 1 else relative.replace("/", "__")
            shutil.copyfile(repo / relative, outputs / name)
    response = outputs / "response.md"
    facts["response"] = response_facts(response.read_text(encoding="utf-8") if response.exists() else "")
    (run_dir / "facts.json").write_text(json.dumps(facts, indent=2) + "\n", encoding="utf-8")
    return facts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", type=Path, help="workspace created by prepare.py")
    args = parser.parse_args()
    for run_dir in sorted(args.workspace.glob("eval-*/*_skill")):
        name = f"{run_dir.parent.name}/{run_dir.name}"
        if not (run_dir / "outputs" / "response.md").exists():
            print(f"{name}: pending")
            continue
        f = run_facts(run_dir)
        plans = [(p["path"], p["status_line"], p["sections_in_order"]) for p in f["plans"]]
        tasks = [(t["path"], len(t["tasks"]), t["has_tracking"], t.get("original_lines_kept_in_order"))
                 for t in f["tasks"]]
        print(f"{name}: source_unchanged={f['source_unchanged']} head_unchanged={f['head_unchanged']} "
              f"artifacts+={f['artifact_added']} artifacts~={f['artifact_changed']} plans={plans} tasks={tasks} "
              f"PLAN:={bool(f['response']['plan_lines'])} TASKS:={bool(f['response']['tasks_lines'])} "
              f"status={f['response']['status_values']}")


if __name__ == "__main__":
    main()
