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
        self.assertEqual(set(evals), set(range(1, 9)))
        self.assertEqual(len(prepare.CASES), len(evals))
        raw = json.loads((HERE / "evals.json").read_text(encoding="utf-8"))
        self.assertEqual(raw["skill_name"], "execute")
        self.assertEqual(len(raw["evals"]), len(evals))
        for case_id, case in evals.items():
            with self.subTest(case=case_id):
                self.assertEqual(set(case), {"id", "prompt", "expected_output", "files", "assertions"})
                self.assertEqual(case["files"], [])
                self.assertTrue(case["expected_output"])
                self.assertTrue(case["assertions"])
                self.assertTrue(all(isinstance(item, str) and item for item in case["assertions"]))
                if case_id in prepare.DIRECT_CASES:
                    self.assertIn("{cwd}", case["prompt"])
                    self.assertNotIn("{plan}", case["prompt"])
                    self.assertNotIn("{tasks}", case["prompt"])
                else:
                    self.assertIn("{plan}", case["prompt"])
                    self.assertIn("{tasks}", case["prompt"])
                self.assertIn("{baseRef}", case["prompt"])
                slug = prepare.CASES[case_id]
                self.assertRegex(slug, r"^[a-z]+(?:-[a-z]+)*$")

    def test_all_pairs_paths_refs_hashes_and_metadata(self):
        prepare.prepare(self.workspace, range(1, 9))
        self.assertEqual(len(list(self.workspace.iterdir())), 8)
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
                refs = []
                for variant in ("old_skill", "with_skill"):
                    run = self.run_data(case_id, variant)
                    repo = case_dir / variant / "repo"
                    outputs = repo.parent / "outputs"
                    direct = case_id in prepare.DIRECT_CASES
                    plan = None if direct else repo / ".artifacts" / slug / "PLAN.md"
                    tasks = None if direct else repo / ".artifacts" / slug / "TASKS.md"
                    self.assertEqual(run["cwd"], str(repo))
                    self.assertEqual(run["plan"], None if direct else str(plan))
                    self.assertEqual(run["tasks"], None if direct else str(tasks))
                    self.assertIsNone(run["target"])
                    self.assertEqual(run["prompt"], case["prompt"].format(
                        plan=plan, tasks=tasks, baseRef=run["baseRef"], cwd=repo))
                    for marker in ("{plan}", "{tasks}", "{baseRef}", "{cwd}"):
                        self.assertNotIn(marker, run["prompt"])
                    self.assertTrue(Path(run["cwd"]).is_absolute())
                    self.assertTrue((repo / ".git").is_dir())
                    self.assertEqual(list(outputs.iterdir()), [])
                    self.assertNotIn("assertions", run)
                    self.assertNotIn("expected_output", run)
                    refs.append(run["baseRef"])
                    head = subprocess.run(
                        ["git", "rev-parse", "HEAD"], cwd=repo,
                        capture_output=True, text=True)
                    self.assertEqual(head.returncode, 0)
                    self.assertEqual(head.stdout.strip(), run["baseRef"])
                    status = subprocess.run(
                        ["git", "status", "--porcelain"], cwd=repo,
                        capture_output=True, text=True)
                    self.assertEqual(status.returncode, 0)
                    self.assertEqual(status.stdout.strip(), "")
                    blobs = {}
                    for path in repo.rglob("*"):
                        name = path.relative_to(repo).as_posix()
                        if name.startswith(".git/") or name == ".git":
                            continue
                        if name.startswith("outputs/") or name in ("run.json", "eval_metadata.json"):
                            continue
                        if path.is_symlink():
                            self.fail(f"unexpected symlink: {name}")
                        elif path.is_file():
                            blobs[name] = path.read_bytes()
                    self.assertEqual(run["fixture_input_hashes"], {
                        name: hashlib.sha256(data).hexdigest() for name, data in blobs.items()
                    })
                    for key, value in prepare.input_manifest(repo).items():
                        self.assertEqual(run[key], value)
                    # The bug is present at base: prefix still tag:.
                    self.assertIn('"tag:"', (repo / "app.mjs").read_text())
                    if direct:
                        self.assertFalse((repo / ".artifacts").exists())
                        self.assertIn(str(repo), run["prompt"])
                    else:
                        self.assertIn("- [ ] T1", tasks.read_text())
                    inventories.append(blobs)
                self.assertEqual(inventories[0], inventories[1])
                self.assertEqual(refs[0], refs[1])

    def test_case_shapes(self):
        prepare.prepare(self.workspace, range(1, 9))
        run2 = self.run_data(2)
        tasks2 = Path(run2["cwd"]).joinpath(".artifacts/tdd-regression/TASKS.md").read_text()
        self.assertIn("test/", tasks2)
        self.assertIn("node --test", tasks2)
        run4 = self.run_data(4)
        tasks4 = Path(run4["cwd"]).joinpath(".artifacts/blocked-scope/TASKS.md").read_text()
        self.assertIn("positional", tasks4)
        run5 = self.run_data(5)
        tasks5 = Path(run5["cwd"]).joinpath(".artifacts/manual-deferred/TASKS.md").read_text()
        self.assertIn("live picker", tasks5)
        run6 = self.run_data(6)
        tasks6 = Path(run6["cwd"]).joinpath(".artifacts/minimal-diff/TASKS.md").read_text()
        self.assertIn("only the prefix option", tasks6)
        self.assertNotIn("T2", tasks6)
        run7 = self.run_data(7)
        plan7 = Path(run7["plan"]).read_text()
        tasks7 = Path(run7["tasks"]).read_text()
        self.assertIn("test-only handoff", plan7)
        self.assertIn("(test-only)", tasks7)
        self.assertIn("Depends on: T1", tasks7)
        self.assertNotIn("Handoff evidence", tasks7)
        self.assertNotEqual(plan7, prepare.CLEAN_PLAN)
        run8 = self.run_data(8)
        self.assertIsNone(run8["plan"])
        self.assertIsNone(run8["tasks"])
        self.assertEqual(sorted(run8["fixture_input_hashes"]), sorted(prepare.SOURCES))

    def test_workspace_rejects_dirty_subject_state(self):
        # Simulate a subject run, then confirm the grader primitives see it.
        prepare.prepare(self.workspace, [1])
        run = self.run_data(1)
        repo = Path(run["cwd"])
        (repo / "app.mjs").write_text((repo / "app.mjs").read_text().replace('"tag:"', '"label:"'))
        status = subprocess.run(
            ["git", "status", "--porcelain"], cwd=repo,
            capture_output=True, text=True).stdout
        self.assertIn("M app.mjs", status)
        manifest = prepare.input_manifest(repo)
        self.assertNotEqual(
            manifest["fixture_input_hashes"]["app.mjs"], run["fixture_input_hashes"]["app.mjs"])
        self.assertEqual(
            manifest["fixture_input_hashes"][".artifacts/simple-prefix/PLAN.md"],
            run["fixture_input_hashes"][".artifacts/simple-prefix/PLAN.md"])

    def test_existing_workspace_is_never_overwritten(self):
        prepare.prepare(self.workspace, [1])
        run = self.run_data(1)
        before = prepare.input_manifest(Path(run["cwd"]))
        with self.assertRaisesRegex(ValueError, "already exists"):
            prepare.prepare(self.workspace, [2])
        self.assertEqual(prepare.input_manifest(Path(run["cwd"])), before)
        self.assertEqual(len(list(self.workspace.iterdir())), 1)

    def test_invalid_ids_do_not_create_workspace(self):
        for ids in ([], [0], [9], [1, 1], [1, 999], ["../escape"], [True], [1.0]):
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                prepare.prepare(self.workspace, ids)
            self.assertFalse(self.workspace.exists())

    def test_cli_selected_cases_and_rejections(self):
        command = [
            sys.executable, "-B", str(HERE / "prepare.py"),
            "--workspace", str(self.workspace), "--cases", "1", "4",
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
