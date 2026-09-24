"""Offline fixture-construction tests, not model evaluation or grading."""

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import facts
import prepare


HERE = Path(__file__).resolve().parent
PLACEHOLDERS = ("{repo}", "{outputs}", "{host}", "{convo}", "{latest}")


class PrepareTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=".test-fixtures-", dir=HERE)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"

    def run_data(self, case_id, variant="with_skill"):
        slug = prepare.CASES[case_id]["slug"]
        path = self.workspace / f"eval-{case_id}-{slug}" / variant / "run.json"
        return json.loads(path.read_text(encoding="utf-8"))

    def test_eval_schema(self):
        evals = prepare.load_evals()
        self.assertEqual(set(evals), set(range(1, 7)))
        self.assertEqual(set(prepare.CASES), set(evals))
        raw = json.loads((HERE / "evals.json").read_text(encoding="utf-8"))
        self.assertEqual(raw["skill_name"], "planner")
        self.assertEqual(len(raw["evals"]), len(evals))
        for case_id, case in evals.items():
            with self.subTest(case=case_id):
                self.assertEqual(set(case), {"id", "prompt", "expected_output", "files", "assertions"})
                self.assertEqual(case["files"], [])
                self.assertTrue(case["expected_output"])
                self.assertTrue(case["assertions"])
                self.assertTrue(all(isinstance(item, str) and item for item in case["assertions"]))
                self.assertTrue(case["prompt"].startswith("User: "))
                history, latest = prepare.split_conversation(case["prompt"])
                self.assertTrue(latest)
                self.assertNotIn("\n\nUser: ", latest)
                self.assertRegex(prepare.CASES[case_id]["slug"], r"^[a-z]+(?:-[a-z]+)*$")

    def test_all_pairs_paths_bytes_hashes_and_metadata(self):
        prepare.prepare(self.workspace, range(1, 7))
        self.assertEqual(len(list(self.workspace.iterdir())), 6)
        for case_id, case in prepare.load_evals().items():
            with self.subTest(case=case_id):
                slug = prepare.CASES[case_id]["slug"]
                case_dir = self.workspace / f"eval-{case_id}-{slug}"
                metadata = json.loads((case_dir / "eval_metadata.json").read_text(encoding="utf-8"))
                self.assertEqual(metadata["eval_id"], case_id)
                self.assertEqual(metadata["eval_name"], slug)
                for key in ("prompt", "expected_output", "files", "assertions"):
                    self.assertEqual(metadata[key], case[key])
                _, latest = prepare.split_conversation(case["prompt"])
                inventories, heads = [], []
                for variant in ("old_skill", "with_skill"):
                    run = self.run_data(case_id, variant)
                    repo = case_dir / variant / "repo"
                    outputs = repo.parent / "outputs"
                    self.assertEqual(run["variant"], variant)
                    self.assertEqual(run["cwd"], str(repo))
                    self.assertEqual(run["outputs"], str(outputs))
                    self.assertEqual(run["host"], prepare.CASES[case_id]["host"])
                    self.assertEqual(run["prompt"].count("{skill}"), 1)
                    for placeholder in PLACEHOLDERS:
                        self.assertNotIn(placeholder, run["prompt"])
                    for resolved in (str(repo), str(outputs), run["host"], f"User: {latest}"):
                        self.assertIn(resolved, run["prompt"])
                    self.assertEqual(list(outputs.iterdir()), [])
                    self.assertTrue((repo / ".git").is_dir())
                    self.assertEqual(prepare.git(repo, "rev-parse", "HEAD"), run["fixture_head"])
                    self.assertEqual(prepare.git(repo, "status", "--porcelain", "--", ".", ":!.artifacts"), "")
                    self.assertNotIn("assertions", run)
                    self.assertNotIn("expected_output", run)
                    blobs = {}
                    for path in repo.rglob("*"):
                        relative = path.relative_to(repo)
                        if relative.parts[0] == ".git":
                            continue
                        if path.is_symlink():
                            self.fail(f"unexpected symlink: {relative}")
                        elif path.is_file():
                            blobs[relative.as_posix()] = path.read_bytes()
                    self.assertEqual(run["fixture_input_hashes"], {
                        name: hashlib.sha256(data).hexdigest() for name, data in blobs.items()
                    })
                    self.assertEqual(prepare.input_manifest(repo)["fixture_input_hashes"],
                                     run["fixture_input_hashes"])
                    inventories.append(blobs)
                    heads.append(run["fixture_head"])
                    combined = b"\n".join(blobs.values()).decode("utf-8")
                    for hidden in (case["expected_output"], *case["assertions"]):
                        self.assertNotIn(hidden, combined)
                    for forbidden in ("eval_metadata.json", "run.json", "evals.json", "SKILL.md"):
                        self.assertFalse(list(repo.rglob(forbidden)))
                self.assertEqual(inventories[0], inventories[1])
                self.assertEqual(heads[0], heads[1])

    def test_case_shapes(self):
        prepare.prepare(self.workspace, range(1, 7))
        runs = {case_id: self.run_data(case_id) for case_id in prepare.CASES}
        repo = {case_id: Path(run["cwd"]) for case_id, run in runs.items()}
        for case_id in (1, 2, 6):
            self.assertIn(prepare.FIRST_MESSAGE, runs[case_id]["prompt"])
        self.assertIn("no question tool", runs[2]["host"])
        self.assertIn("plan mode is active", runs[6]["host"])
        history, latest = prepare.split_conversation(prepare.load_evals()[3]["prompt"])
        self.assertNotIn("User answer:", history.rsplit("AskUserQuestion", 1)[1])
        self.assertIn("write up", latest)
        self.assertIn("Status: Draft", (repo[4] / ".artifacts/notes-export/PLAN.md").read_text())
        tasks = (repo[5] / ".artifacts/csv-export/TASKS.md").read_text()
        self.assertIn("- [x] T1", tasks)
        self.assertIn("- [ ] T3", tasks)
        self.assertIn("Context from Peter", (repo[5] / ".artifacts/csv-export/PLAN.md").read_text())
        self.assertTrue((repo[5] / "src/csv.mjs").is_file())
        for case_id in prepare.CASES:
            with self.subTest(case=case_id):
                count = prepare.git(repo[case_id], "rev-list", "--count", "HEAD")
                self.assertEqual(count, "4" if case_id == 5 else "3")
                plans = sorted(p.relative_to(repo[case_id]).as_posix()
                               for p in repo[case_id].rglob("PLAN.md"))
                expected = {4: [".artifacts/notes-export/PLAN.md"],
                            5: [".artifacts/csv-export/PLAN.md"]}.get(case_id, [])
                self.assertEqual(plans, expected)
        base_heads = {runs[case_id]["fixture_head"] for case_id in (1, 2, 3, 4, 6)}
        self.assertEqual(len(base_heads), 1)
        self.assertNotIn(runs[5]["fixture_head"], base_heads)

    def test_facts_reports_integrity_plan_and_response(self):
        prepare.prepare(self.workspace, [5])
        run_dir = self.workspace / "eval-5-explicit-revision-tasks" / "with_skill"
        repo, outputs = run_dir / "repo", run_dir / "outputs"
        (repo / "src/cli.mjs").write_text("// changed\n")
        plan = repo / ".artifacts/new-plan/PLAN.md"
        plan.parent.mkdir()
        plan.write_text("# New\n\nStatus: Draft\nWhy: stopped early.\n\n## Goal\nx\n\n"
                        "## Settled Decisions\nx\n\n## Assumptions\nx\n")
        (outputs / "response.md").write_text(f"PLAN: {plan}\nStatus: Draft\nBlockers: Q1\n")
        result = facts.run_facts(run_dir)
        self.assertFalse(result["source_unchanged"])
        self.assertEqual(result["non_artifact_changes"], ["src/cli.mjs"])
        self.assertEqual(result["artifact_added"], [".artifacts/new-plan/PLAN.md"])
        self.assertEqual(result["artifact_changed"], [])
        self.assertTrue(result["head_unchanged"])
        [plan_result] = result["plans"]
        self.assertEqual(plan_result["status_line"], "Status: Draft")
        self.assertEqual(plan_result["lines_after_status"][0], "Why: stopped early.")
        self.assertEqual(plan_result["sections"], ["Goal", "Settled Decisions", "Assumptions"])
        self.assertFalse(plan_result["sections_in_order"])
        self.assertEqual(result["response"]["plan_lines"], [str(plan)])
        self.assertEqual(result["response"]["status_values"], ["Draft"])
        self.assertFalse(result["response"]["blockers_none"])
        self.assertEqual((outputs / "PLAN.md").read_bytes(), plan.read_bytes())
        self.assertTrue((run_dir / "facts.json").is_file())
        prepare.git(repo, "add", "-A")
        prepare.git(repo, "commit", "-q", "-m", "subject commit")
        self.assertFalse(facts.run_facts(run_dir)["head_unchanged"])
        untouched = facts.run_facts(run_dir.parent / "old_skill")
        self.assertTrue(untouched["source_unchanged"])
        self.assertTrue(untouched["head_unchanged"])
        self.assertEqual(untouched["plans"], [])
        self.assertFalse(untouched["response"]["exists"])

    def test_manifest_detects_mutations_and_added_files(self):
        prepare.prepare(self.workspace, [1])
        run = self.run_data(1)
        repo = Path(run["cwd"])
        (repo / "src/store.mjs").write_text("// changed\n")
        (repo / "EXTRA.md").write_text("extra\n")
        manifest = prepare.input_manifest(repo)["fixture_input_hashes"]
        self.assertNotEqual(manifest["src/store.mjs"], run["fixture_input_hashes"]["src/store.mjs"])
        self.assertIn("EXTRA.md", manifest)
        self.assertNotIn("EXTRA.md", run["fixture_input_hashes"])
        old_repo = Path(self.run_data(1, "old_skill")["cwd"])
        self.assertIn("searchNotes", (old_repo / "src/store.mjs").read_text())

    def test_existing_workspace_is_never_overwritten(self):
        prepare.prepare(self.workspace, [1])
        run = self.run_data(1)
        before = prepare.input_manifest(Path(run["cwd"]))
        with self.assertRaisesRegex(ValueError, "already exists"):
            prepare.prepare(self.workspace, [2])
        self.assertEqual(prepare.input_manifest(Path(run["cwd"])), before)
        self.assertEqual(len(list(self.workspace.iterdir())), 1)

    def test_invalid_ids_do_not_create_workspace(self):
        for ids in ([], [0], [7], [1, 1], [1, 999], ["../escape"], [True], [1.0]):
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                prepare.prepare(self.workspace, ids)
            self.assertFalse(self.workspace.exists())

    def test_cli_selected_cases_and_rejections(self):
        command = [
            sys.executable, "-B", str(HERE / "prepare.py"),
            "--workspace", str(self.workspace), "--cases", "1", "5",
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), str(self.workspace))
        self.assertEqual(len(list(self.workspace.iterdir())), 2)
        repeated = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(repeated.returncode, 0)
        self.assertIn("already exists", repeated.stderr)


if __name__ == "__main__":
    unittest.main()
