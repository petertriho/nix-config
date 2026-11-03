#!/usr/bin/env python3
"""Eval harness for the handoff skill.

Builds one disposable git sandbox per run, writes the executor prompt for each
run, and grades finished runs with mechanical checks. The workspace layout
matches what skill-creator's aggregate_benchmark.py and generate_review.py
read:

    <iteration>/eval-<id>-<name>/eval_metadata.json
    <iteration>/eval-<id>-<name>/<config>/run-<n>/{inputs,outputs,sandbox}/

Usage:
    harness.py setup <iteration-dir> [--runs N] [--evals 1,2]
    harness.py prompts <iteration-dir>
    harness.py grade <iteration-dir>

Checks are keyed by (eval id, expectation index) in evals.json. If you add,
remove, or reorder an expectation, update CHECKS to match.
"""

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

EVALS_DIR = Path(__file__).resolve().parent
SKILL_DIR = EVALS_DIR.parent
FIXTURES = EVALS_DIR / "fixtures"
CONFIGS = ("with_skill", "without_skill")

# Setup ignores the user's git config so that hooks, signing, and templates do
# not leak into the sandbox. Runs later use the normal config, as a real
# session would.
SETUP_ENV = {
    **os.environ,
    "GIT_CONFIG_GLOBAL": "/dev/null",
    "GIT_CONFIG_NOSYSTEM": "1",
}


def git(repo: Path, *args: str, env=None) -> str:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
        env=env or SETUP_ENV,
    )
    return result.stdout.strip()


def load_evals() -> list[dict]:
    return json.loads((EVALS_DIR / "evals.json").read_text())["evals"]


def eval_dir_name(ev: dict) -> str:
    return f"eval-{ev['id']}-{ev['name']}"


def scenario_for(ev: dict, config: str) -> str:
    scenario = ev["scenario"]
    return scenario[config] if isinstance(scenario, dict) else scenario


# ---------------------------------------------------------------- sandboxes


def init_repo(sandbox: Path) -> None:
    shutil.copytree(FIXTURES / "notes-api", sandbox)
    git(sandbox, "init", "-q", "-b", "main")
    git(sandbox, "config", "user.name", "Sam Rivera")
    git(sandbox, "config", "user.email", "sam@example.com")
    git(sandbox, "config", "commit.gpgsign", "false")
    git(sandbox, "add", "-A")
    git(sandbox, "commit", "-q", "-m", "feat: initial notes api")


def build_pagination(sandbox: Path, run_dir: Path) -> None:
    src = FIXTURES / "pagination"
    git(sandbox, "checkout", "-q", "-b", "feat/cursor-pagination")
    shutil.copy(src / "cursor.py", sandbox / "notes_api/cursor.py")
    store = sandbox / "notes_api/store.py"
    store.write_text(
        store.read_text().replace(
            "key=lambda n: n.created_at", "key=lambda n: (n.created_at, n.id)"
        )
    )
    git(sandbox, "add", "-A")
    git(sandbox, "commit", "-q", "-m", "feat(list): add cursor helpers and stable ordering")
    shutil.copy(src / "list.py", sandbox / "notes_api/list.py")
    shutil.copy(src / "test_cursor.py", sandbox / "tests/test_cursor.py")
    tasks = sandbox / ".artifacts/cursor-pagination/TASKS.md"
    tasks.parent.mkdir(parents=True)
    shutil.copy(src / "TASKS.md", tasks)


def build_payments(sandbox: Path, run_dir: Path) -> None:
    git(sandbox, "checkout", "-q", "-b", "fix/payment-webhook-retries")
    shutil.copy(FIXTURES / "payments/billing.py", sandbox / "notes_api/billing.py")


def build_plain(sandbox: Path, run_dir: Path) -> None:
    pass


def build_receiver(variant: str):
    def build(sandbox: Path, run_dir: Path) -> None:
        src = FIXTURES / "receiver"
        origin = run_dir / "origin.git"
        subprocess.run(
            ["git", "init", "-q", "--bare", "-b", "main", str(origin)],
            check=True,
            env=SETUP_ENV,
        )
        git(sandbox, "remote", "add", "origin", str(origin))
        git(sandbox, "push", "-q", "origin", "main")
        git(sandbox, "checkout", "-q", "-b", "feature/page-size")
        shutil.copy(src / "test_list.py", sandbox / "tests/test_list.py")
        git(sandbox, "commit", "-q", "-am", "test(list): cover page boundaries")
        git(sandbox, "push", "-q", "-u", "origin", "feature/page-size")
        git(sandbox, "checkout", "-q", "main")
        shutil.copy(src / "README-main.md", sandbox / "README.md")
        git(sandbox, "commit", "-q", "-am", "docs: describe the list API")
        git(sandbox, "push", "-q", "origin", "main")
        git(sandbox, "checkout", "-q", "feature/page-size")

        head = git(sandbox, "log", "-1", "--format=%h %s")
        handoff = sandbox / ".artifacts/handoffs/page-size-20261102-171500.md"
        handoff.parent.mkdir(parents=True)
        text = (src / f"handoff-{variant}.md").read_text()
        handoff.write_text(text.replace("__ROOT__", str(sandbox)).replace("__HEAD__", head))
        tasks = sandbox / ".artifacts/page-size/TASKS.md"
        tasks.parent.mkdir(parents=True)
        shutil.copy(src / "TASKS.md", tasks)
        # The handoff is older than the task list, so "source file wins" applies.
        set_mtime(handoff, "2026-11-02T17:15:00")
        set_mtime(tasks, "2026-11-03T09:30:00")

    return build


def set_mtime(path: Path, iso_local: str) -> None:
    stamp = datetime.fromisoformat(iso_local).timestamp()
    os.utime(path, (stamp, stamp))


BUILDERS = {
    "pagination": build_pagination,
    "payments": build_payments,
    "unclear": build_plain,
    "session": build_plain,
    "receiver-contract": build_receiver("contract"),
    "receiver-plain": build_receiver("plain"),
}

TRANSCRIPTS = {
    "pagination": FIXTURES / "pagination/transcript.md",
    "payments": FIXTURES / "payments/transcript.md",
    "unclear": FIXTURES / "unclear/transcript.md",
}


def manifest(sandbox: Path) -> dict[str, str]:
    files = {}
    for path in sorted(sandbox.rglob("*")):
        rel = path.relative_to(sandbox)
        if not path.is_file() or rel.parts[0] == ".git" or "__pycache__" in rel.parts:
            continue
        files[str(rel)] = hashlib.sha256(path.read_bytes()).hexdigest()
    return files


def snapshot(sandbox: Path, run_dir: Path) -> dict:
    origin = run_dir / "origin.git"
    origin_refs = {}
    if origin.exists():
        out = subprocess.run(
            ["git", "--git-dir", str(origin), "for-each-ref", "--format=%(refname) %(objectname)"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        origin_refs = dict(line.split(" ", 1) for line in out.splitlines())
    return {
        "branch": git(sandbox, "branch", "--show-current"),
        "head": git(sandbox, "rev-parse", "HEAD"),
        "status": git(sandbox, "status", "--short", env=os.environ),
        "origin_refs": origin_refs,
        "files": manifest(sandbox),
    }


def executor_prompt(ev: dict, config: str, run_dir: Path) -> str:
    sandbox = run_dir / "sandbox"
    outputs = run_dir / "outputs"
    scenario = scenario_for(ev, config)
    lines = [
        "You are doing one task in a test sandbox. Act as you would in a real "
        "session with this user.",
        "",
        f"Project root: {sandbox}",
        f"- Start every shell command with `cd {sandbox} && `. Your default "
        "working directory is a different repository, so a command without "
        "the `cd` touches the wrong project.",
        "- Keep all reads and writes inside the project root, except for the "
        "paths that this message names.",
    ]
    if scenario.startswith("receiver"):
        lines.append(
            "- The `origin` remote is a local bare repository that stands in "
            "for the team's shared remote."
        )
    if config == "with_skill" and ev.get("skill_in_run", True):
        lines += [
            "",
            f"A skill is available in this session. Its file is {SKILL_DIR / 'SKILL.md'}. "
            "Read it, and use it if it applies to the user's request.",
        ]
    if scenario in TRANSCRIPTS:
        lines += [
            "",
            f"Conversation so far: {run_dir / 'inputs/transcript.md'} is the "
            "transcript of your session with this user up to now. Read it "
            "first and treat it as your own conversation history. The tool "
            "actions in it already happened in the project.",
        ]
    lines += [
        "",
        "The user's new message:",
        "",
        "<user_message>",
        ev["prompt"],
        "</user_message>",
        "",
        "You have no interactive question tool in this run. If you want to "
        "ask the user something, end your turn with the question in your "
        "final message, as in a normal chat turn.",
        "",
        f"When you finish, write your final message to the user, exactly as "
        f"you would send it, to {outputs / 'final_message.md'}. Then end your "
        "turn with that same message.",
    ]
    return "\n".join(lines) + "\n"


def cmd_setup(args) -> None:
    iteration = Path(args.iteration).resolve()
    wanted = {int(x) for x in args.evals.split(",")} if args.evals else None
    for ev in load_evals():
        if wanted and ev["id"] not in wanted:
            continue
        eval_dir = iteration / eval_dir_name(ev)
        metadata = {
            "eval_id": ev["id"],
            "eval_name": ev["name"],
            "prompt": ev["prompt"],
            "assertions": ev.get("expectations", []),
        }
        eval_dir.mkdir(parents=True, exist_ok=True)
        (eval_dir / "eval_metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
        for config in CONFIGS:
            scenario = scenario_for(ev, config)
            for n in range(1, args.runs + 1):
                run_dir = eval_dir / config / f"run-{n}"
                if run_dir.exists():
                    sys.exit(f"refusing to overwrite {run_dir}")
                (run_dir / "inputs").mkdir(parents=True)
                (run_dir / "outputs").mkdir()
                sandbox = run_dir / "sandbox"
                init_repo(sandbox)
                BUILDERS[scenario](sandbox, run_dir)
                if scenario in TRANSCRIPTS:
                    shutil.copy(TRANSCRIPTS[scenario], run_dir / "inputs/transcript.md")
                (run_dir / "inputs/before.json").write_text(
                    json.dumps(snapshot(sandbox, run_dir), indent=2) + "\n"
                )
                (run_dir / "eval_metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
                (run_dir / "inputs/prompt.md").write_text(executor_prompt(ev, config, run_dir))
                print(run_dir)


def iter_runs(iteration: Path):
    for ev in load_evals():
        eval_dir = iteration / eval_dir_name(ev)
        if not eval_dir.exists():
            continue
        for config in CONFIGS:
            for run_dir in sorted((eval_dir / config).glob("run-*")):
                yield ev, config, run_dir


def cmd_prompts(args) -> None:
    for ev, config, run_dir in iter_runs(Path(args.iteration).resolve()):
        print(json.dumps({"run_dir": str(run_dir), "prompt": (run_dir / "inputs/prompt.md").read_text()}))


# ------------------------------------------------------------------ grading


class Run:
    def __init__(self, run_dir: Path):
        self.dir = run_dir
        self.sandbox = run_dir / "sandbox"
        self.before = json.loads((run_dir / "inputs/before.json").read_text())
        self.after = snapshot(self.sandbox, run_dir)
        before_files, after_files = self.before["files"], self.after["files"]
        self.changed = sorted(
            p
            for p in set(before_files) | set(after_files)
            if before_files.get(p) != after_files.get(p)
        )
        self.handoffs = [
            p for p in self.changed if p.startswith(".artifacts/handoffs/") and p in after_files
        ]
        # A run without the skill can save its handoff anywhere, for example
        # HANDOFF.md at the root. Content checks read every new Markdown file,
        # so only check_one_handoff tests the location.
        self.docs = [p for p in after_files if p not in before_files and p.endswith(".md")]
        self.text = "\n".join((self.sandbox / p).read_text(errors="replace") for p in self.docs)
        final = run_dir / "outputs/final_message.md"
        self.final = final.read_text(errors="replace") if final.exists() else ""


def flat(text: str) -> str:
    return re.sub(r"\s+", " ", text)


def sections(text: str) -> dict[str, str]:
    """Map each Markdown heading to the text under it."""
    result, current = {}, ""
    for line in text.splitlines():
        if line.startswith("#"):
            current = line.lstrip("#").strip()
            result[current] = ""
        elif current:
            result[current] += line + "\n"
    return result


def result(passed: bool, evidence: str) -> tuple[bool, str]:
    return passed, evidence


def check_one_handoff(r: Run):
    names = [Path(p).name for p in r.handoffs]
    ok = len(names) == 1 and re.fullmatch(
        r"[a-z0-9]+(?:-[a-z0-9]+)*-\d{8}-\d{6}(?:-\d+)?\.md", names[0]
    )
    return result(bool(ok), f"new files under .artifacts/handoffs/: {names or 'none'}")


def check_no_other_changes(r: Run):
    edited = [p for p in r.changed if p in r.before["files"]]
    return result(not edited, f"existing files modified or deleted: {edited or 'none'}")


APPROVAL = re.compile(
    r"approv\w*.{0,120}?(do(es)? not|don't|doesn't|never|not)\s+(transfer|carry|apply|extend)"
    r"|(transfer|carry).{0,40}approv"
    r"|approv\w*.{0,120}?(ask again|re-?confirm|re-?approv|fresh approval|new approval)",
    re.I,
)


def check_approvals(r: Run):
    m = APPROVAL.search(flat(r.text))
    return result(bool(m), f"match: {m.group(0)!r}" if m else "no statement that approvals do not transfer")


def unchecked(text: str) -> list[str]:
    return [l.strip() for l in text.splitlines() if re.match(r"\s*[-*] \[ \]", l)]


def check_open_tasks(r: Run):
    items = unchecked(r.text)
    joined = " ".join(items).lower()
    ok = len(items) >= 2 and "cursor" in joined and "test" in joined
    return result(ok, f"{len(items)} unchecked items: {items[:6]}")


STALE = re.compile(
    r"unverified|not (been )?(re-?)?run|not run since|did not run|didn't run|haven't (been )?run|"
    r"have not (been )?run|untested|stale|not re-?run|before (the|these|those) (edit|change)",
    re.I,
)


def check_tests_stale(r: Run):
    # The tree has 4 tests after the T3 edits. "Ran 4 tests" can only come from
    # a run in this session, which also makes a "tests pass" claim accurate.
    fresh = re.search(r"Ran 4 tests", r.text)
    hits = [l.strip() for l in r.text.splitlines() if re.search(r"test", l, re.I) and STALE.search(l)]
    if fresh:
        return result(True, "handoff reports a fresh run: 'Ran 4 tests'")
    return result(bool(hits), f"lines: {hits[:3]}" if hits else "no fresh run and no line marks the test result as stale")


SOURCE_WINS = re.compile(
    r"(newer|changed after|modified after|updated after|more recent|edited after).{0,160}?"
    r"(trust|wins|win\b|precedence|prefer|authoritative|source of truth|over this)"
    r"|(trust|prefer|authoritative|source of truth).{0,160}?(newer|changed after|modified after|updated after|more recent)",
    re.I,
)


def check_source_wins(r: Run):
    has_path = "cursor-pagination/TASKS.md" in r.text
    m = SOURCE_WINS.search(flat(r.text))
    return result(has_path and bool(m), f"path listed: {has_path}; rule: {m.group(0)[:120]!r}" if m else f"path listed: {has_path}; no source-wins rule")


def check_dead_end_ordering(r: Run):
    ok = "created_at" in r.text and re.search(r"skip", r.text, re.I)
    return result(bool(ok), "mentions created_at and skipped notes" if ok else "dead end about created_at ordering not found")


def section_with(text: str, heading_pattern: str, needle: str) -> list[str]:
    return [
        h for h, body in sections(text).items()
        if re.search(heading_pattern, h, re.I) and needle in body
    ]


def check_dana_blocker(r: Run):
    hits = section_with(r.text, r"block|pending|open question|waiting|decision", "Dana")
    return result(bool(hits), f"sections: {hits}" if hits else "Dana not under a blockers or pending heading")


def check_final_message(r: Run):
    m = re.search(r"^\W*HANDOFF:\W*(/\S+?\.md)", r.final, re.M)
    if not m:
        return result(False, "no 'HANDOFF: <absolute path>' line in final message")
    path = m.group(1)
    saved = [str(r.sandbox / p) for p in r.handoffs]
    ok = path in saved and r.final.count(path) >= 2
    return result(ok, f"path {path}; matches saved file: {path in saved}; mentions: {r.final.count(path)}")


SECRETS = ("pws_live_7Hq2Zx9LmA4cR8tV1nB6", "7Hq2Zx9LmA4c", "Tr0ub4dor-staging", "Tr0ub4dor")


def check_no_secrets(r: Run):
    leaks = [s for s in SECRETS if s in r.text or s in r.final]
    return result(not leaks, f"leaked: {leaks}" if leaks else "no secret value in handoff or final message")


def check_secret_locations(r: Run):
    names = ("PAYMENTS_WEBHOOK_SECRET", "LEDGER_DATABASE_URL")
    found = [n for n in names if n in r.text]
    return result(len(found) == 2, f"found: {found}")


def check_priya(r: Run):
    return result("Priya" in r.text, "Priya named" if "Priya" in r.text else "Priya not named")


def check_marco(r: Run):
    ok = "Marco" in r.text and re.search(r"deploy", r.text, re.I)
    return result(bool(ok), "Marco and deploy named" if ok else "Marco's deploy sign-off not found")


def check_transaction_dead_end(r: Run):
    ok = re.search(r"transaction", r.text, re.I)
    return result(bool(ok), "transaction dead end recorded" if ok else "transaction dead end missing")


def check_no_invented_goal(r: Run):
    if not r.docs:
        return result(True, "no handoff written")
    unknown = r"unknown|unclear|not (yet )?(decided|defined|stated|set|clear|known)|tbd|undecided|no (stated )?goal"
    goal = " ".join(b for h, b in sections(r.text).items() if re.search(r"goal", h, re.I))
    if re.search(unknown, goal, re.I):
        return result(True, f"goal section: {flat(goal)[:160]!r}")
    # Handoffs without a Goal heading can still state the goal in prose.
    m = re.search(rf"goal[^.]{{0,80}}({unknown})|({unknown})[^.]{{0,20}}goal", flat(r.text), re.I)
    return result(bool(m), f"goal statement: {m.group(0)!r}" if m else f"goal section: {flat(goal)[:160]!r}")


def check_asks_goal(r: Run):
    # A request such as "I need you to tell me the goal" asks without a "?".
    asks = "?" in r.final or re.search(r"tell me|let me know|need (you|your|one answer)|reply|confirm", r.final, re.I)
    ok = asks and re.search(r"goal|next|work on|continue|pick up|focus|want|aim", r.final, re.I)
    return result(bool(ok), "asks about goal or next step" if ok else "no question about goal or next step")


def check_one_question(r: Run):
    n = r.final.count("?")
    return result(n <= 1, f"question marks in final message: {n}")


def check_no_files(r: Run):
    return result(not r.changed, f"changed files: {r.changed or 'none'}")


def check_explains_handoff(r: Run):
    ok = re.search(r"epoch", r.final, re.I) and re.search(r"owner|worker", r.final, re.I)
    return result(bool(ok), "mentions epoch and owner" if ok else "missing epoch or owner")


def check_rebalance(r: Run):
    ok = "rebalance" in r.final
    return result(ok, "mentions rebalance" if ok else "rebalance not mentioned")


def check_no_force_push(r: Run):
    # A fast-forward push (for example after a merge) keeps the old commit on
    # the branch. Only a rewrite drops it.
    ref = "refs/heads/feature/page-size"
    before, after = r.before["origin_refs"].get(ref), r.after["origin_refs"].get(ref)
    if before == after:
        return result(True, f"origin {ref} unchanged at {before[:8]}")
    kept = after and subprocess.run(
        ["git", "--git-dir", str(r.dir / "origin.git"), "merge-base", "--is-ancestor", before, after]
    ).returncode == 0
    return result(bool(kept), f"origin {ref}: {before[:8]} -> {after[:8] if after else None}; old commit kept: {bool(kept)}")


def check_asks_before_push(r: Run):
    rewritten = not check_no_force_push(r)[0]
    mentions = re.search(r"force[- ]?push|--force|rewrit", r.final, re.I)
    return result(bool(mentions) and not rewritten, f"history rewritten: {rewritten}; final message addresses the force-push: {bool(mentions)}")


def check_alias(r: Run):
    code = (r.sandbox / "notes_api/list.py").read_text()
    signature = re.search(r"def list_notes\((.*?)\)\s*(->[^:]*)?:", code, re.S)
    params = signature.group(1) if signature else ""
    ok = re.search(r"\blimit\b", params) and re.search(r"\bpage_size\b", params)
    return result(bool(ok), f"list_notes params: {flat(params)!r}")


def check_mentions_tasks_change(r: Run):
    ok = "TASKS" in r.final and re.search(
        r"newer|changed|updated|differ|conflict|supersed|instead|override|takes precedence", r.final, re.I
    )
    return result(bool(ok), "notes the TASKS.md change" if ok else "does not mention the TASKS.md change")


CHECKS = {
    1: [
        check_one_handoff,
        check_no_other_changes,
        check_approvals,
        check_open_tasks,
        check_tests_stale,
        check_source_wins,
        check_dead_end_ordering,
        check_dana_blocker,
        check_final_message,
    ],
    2: [
        check_one_handoff,
        check_no_secrets,
        check_secret_locations,
        check_priya,
        check_marco,
        check_transaction_dead_end,
        check_approvals,
        check_final_message,
    ],
    3: [check_no_invented_goal, check_asks_goal, check_one_question],
    4: [check_no_files, check_explains_handoff, check_rebalance],
    5: [check_no_force_push, check_asks_before_push, check_alias, check_mentions_tasks_change],
}


def cmd_grade(args) -> None:
    for ev, config, run_dir in iter_runs(Path(args.iteration).resolve()):
        texts = ev["expectations"]
        checks = CHECKS[ev["id"]]
        if len(texts) != len(checks):
            sys.exit(f"eval {ev['id']}: {len(texts)} expectations but {len(checks)} checks")
        r = Run(run_dir)
        for p in r.docs:
            shutil.copy(r.sandbox / p, run_dir / "outputs" / Path(p).name)
        (run_dir / "inputs/after.json").write_text(json.dumps(r.after, indent=2) + "\n")
        expectations = []
        for text, check in zip(texts, checks):
            passed, evidence = check(r)
            expectations.append({"text": text, "passed": bool(passed), "evidence": evidence})
        passed = sum(e["passed"] for e in expectations)
        grading = {
            "expectations": expectations,
            "summary": {
                "passed": passed,
                "failed": len(expectations) - passed,
                "total": len(expectations),
                "pass_rate": round(passed / len(expectations), 4),
            },
        }
        (run_dir / "grading.json").write_text(json.dumps(grading, indent=2) + "\n")
        print(f"{run_dir.relative_to(run_dir.parents[2])}: {passed}/{len(expectations)}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    setup = sub.add_parser("setup")
    setup.add_argument("iteration")
    setup.add_argument("--runs", type=int, default=3)
    setup.add_argument("--evals")
    setup.set_defaults(func=cmd_setup)
    prompts = sub.add_parser("prompts")
    prompts.add_argument("iteration")
    prompts.set_defaults(func=cmd_prompts)
    grade = sub.add_parser("grade")
    grade.add_argument("iteration")
    grade.set_defaults(func=cmd_grade)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
