"""Offline fixture-construction tests, not model evaluation or grading."""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import prepare


HERE = Path(__file__).resolve().parent


class PrepareTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=".test-fixtures-", dir=HERE)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"

    def run_data(self, case_id, variant="with_skill"):
        slug = prepare.CASES[case_id]
        path = self.workspace / f"eval-{case_id}-{slug}" / variant / "run.json"
        return json.loads(path.read_text(encoding="utf-8"))

    def test_eval_schema(self):
        evals = prepare.load_evals()
        self.assertEqual(set(evals), {1, 2, 4, 5, 7, 8})
        self.assertEqual(len(prepare.CASES), len(evals))
        raw = json.loads((HERE / "evals.json").read_text(encoding="utf-8"))
        self.assertEqual(raw["skill_name"], "plan-to-tasks")
        self.assertEqual(len(raw["evals"]), len(evals))
        for case_id, case in evals.items():
            with self.subTest(case=case_id):
                self.assertEqual(set(case), {"id", "prompt", "expected_output", "files", "assertions"})
                self.assertEqual(case["files"], [])
                self.assertTrue(case["expected_output"])
                self.assertTrue(case["assertions"])
                self.assertTrue(all(isinstance(item, str) and item for item in case["assertions"]))
                self.assertIn("{plan}", case["prompt"])
                self.assertEqual("{target}" in case["prompt"], case_id != 7)
                slug = prepare.CASES[case_id]
                self.assertRegex(slug, r"^[a-z]+(?:-[a-z]+)*$")

    def test_all_pairs_paths_bytes_hashes_and_metadata(self):
        prepare.prepare(self.workspace, sorted(prepare.CASES))
        self.assertEqual(len(list(self.workspace.iterdir())), len(prepare.CASES))
        for case_id, case in prepare.load_evals().items():
            with self.subTest(case=case_id):
                slug = prepare.CASES[case_id]
                case_dir = self.workspace / f"eval-{case_id}-{slug}"
                metadata = json.loads((case_dir / "eval_metadata.json").read_text(encoding="utf-8"))
                self.assertEqual(metadata["eval_id"], case_id)
                self.assertEqual(metadata["eval_name"], slug)
                for key in ("prompt", "expected_output", "files", "assertions"):
                    self.assertEqual(metadata[key], case[key])
                inventories = []
                for variant in ("old_skill", "with_skill"):
                    run = self.run_data(case_id, variant)
                    repo = case_dir / variant / "repo"
                    outputs = repo.parent / "outputs"
                    plan = repo / ".artifacts" / slug / "PLAN.md"
                    target = None if case_id == 7 else str(outputs / "TASKS.md")
                    self.assertEqual(run["cwd"], str(repo))
                    self.assertEqual(run["plan"], str(plan))
                    self.assertEqual(run["target"], target)
                    self.assertNotIn("{plan}", run["prompt"])
                    self.assertNotIn("{target}", run["prompt"])
                    self.assertTrue(Path(run["cwd"]).is_absolute())
                    self.assertTrue(Path(run["plan"]).is_absolute())
                    self.assertEqual(list(outputs.iterdir()), [])
                    self.assertFalse((repo / ".git").exists())
                    self.assertNotIn("assertions", run)
                    self.assertNotIn("expected_output", run)
                    blobs = {}
                    for path in repo.rglob("*"):
                        name = path.relative_to(repo).as_posix()
                        if path.is_symlink():
                            self.fail(f"unexpected symlink: {name}")
                        elif path.is_file():
                            blobs[name] = path.read_bytes()
                    self.assertEqual(run["fixture_input_hashes"], {
                        name: hashlib.sha256(data).hexdigest() for name, data in blobs.items()
                    })
                    for key, value in prepare.input_manifest(repo).items():
                        self.assertEqual(run[key], value)
                    inventories.append(blobs)
                    combined = b"\n".join(blobs.values()).decode("utf-8")
                    for hidden in (case["expected_output"], *case["assertions"]):
                        self.assertNotIn(hidden, combined)
                    for forbidden in ("eval_metadata.json", "run.json", "evals.json", "SKILL.md"):
                        self.assertFalse(list(repo.rglob(forbidden)))
                self.assertEqual(inventories[0], inventories[1])

    def test_case_shapes(self):
        prepare.prepare(self.workspace, sorted(prepare.CASES))
        run2 = self.run_data(2)
        self.assertIn("uppercase", Path(run2["cwd"]).joinpath(
            ".artifacts/nongoal-guard/PLAN.md").read_text().lower())
        run5 = self.run_data(5)
        self.assertIn("Nonblocker", Path(run5["cwd"]).joinpath(
            ".artifacts/explicit-assumption/PLAN.md").read_text())
        run7 = self.run_data(7)
        self.assertFalse(Path(run7["plan"]).exists())
        self.assertIsNone(run7["target"])
        plans = list(Path(run7["cwd"]).rglob("PLAN.md"))
        self.assertEqual(len(plans), 1)
        self.assertEqual(plans[0].relative_to(run7["cwd"]).as_posix(), ".artifacts/decoy/PLAN.md")
        run8 = self.run_data(8)
        parallel = Path(run8["cwd"]).joinpath(".artifacts/parallel-safe/PLAN.md").read_text()
        self.assertIn("disjoint", parallel)

    def test_manifest_detects_mutations_and_added_files(self):
        prepare.prepare(self.workspace, [1])
        run = self.run_data(1)
        repo = Path(run["cwd"])
        (repo / "app.mjs").write_text("// changed\n")
        (repo / "EXTRA.md").write_text("extra\n")
        manifest = prepare.input_manifest(repo)
        self.assertNotEqual(manifest["fixture_input_hashes"]["app.mjs"], run["fixture_input_hashes"]["app.mjs"])
        self.assertIn("EXTRA.md", manifest["fixture_input_hashes"])
        self.assertNotIn("EXTRA.md", run["fixture_input_hashes"])
        old_repo = Path(self.run_data(1, "old_skill")["cwd"])
        self.assertIn("tag:", (old_repo / "app.mjs").read_text())

    def test_existing_workspace_is_never_overwritten(self):
        prepare.prepare(self.workspace, [1])
        run = self.run_data(1)
        before = prepare.input_manifest(Path(run["cwd"]))
        with self.assertRaisesRegex(ValueError, "already exists"):
            prepare.prepare(self.workspace, [2])
        self.assertEqual(prepare.input_manifest(Path(run["cwd"])), before)
        self.assertEqual(len(list(self.workspace.iterdir())), 1)

    def test_invalid_ids_do_not_create_workspace(self):
        for ids in ([], [0], [3], [6], [9], [1, 1], [1, 999], ["../escape"], [True], [1.0]):
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                prepare.prepare(self.workspace, ids)
            self.assertFalse(self.workspace.exists())

    def test_cli_selected_cases_and_rejections(self):
        command = [
            sys.executable, "-B", str(HERE / "prepare.py"),
            "--workspace", str(self.workspace), "--cases", "1", "7",
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
