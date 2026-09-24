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
        self.assertEqual(set(evals), set(range(1, 12)))
        self.assertEqual(len(prepare.CASES), len(evals))
        raw = json.loads((HERE / "evals.json").read_text(encoding="utf-8"))
        self.assertEqual(raw["skill_name"], "execution-review")
        self.assertEqual(len(raw["evals"]), len(evals))
        for case_id, case in evals.items():
            with self.subTest(case=case_id):
                self.assertEqual(set(case), {"id", "prompt", "expected_output", "files", "assertions"})
                self.assertEqual(case["files"], [])
                self.assertTrue(case["expected_output"])
                self.assertTrue(case["assertions"])
                self.assertTrue(all(isinstance(item, str) and item for item in case["assertions"]))
                if case_id == 11:  # Implicit selection: no input paths.
                    self.assertNotIn("{plan}", case["prompt"])
                    self.assertNotIn("{tasks}", case["prompt"])
                else:
                    self.assertIn("{plan}", case["prompt"])
                    self.assertIn("{tasks}", case["prompt"])
                self.assertIn("{target}", case["prompt"])
                self.assertIn("{baseRef}", case["prompt"])
                slug = prepare.CASES[case_id]
                self.assertRegex(slug, r"^[a-z]+(?:-[a-z]+)*$")

    def test_all_pairs_paths_refs_hashes_and_metadata(self):
        prepare.prepare(self.workspace, range(1, 12))
        self.assertEqual(len(list(self.workspace.iterdir())), 11)
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
                    plan = repo / ".artifacts" / slug / "PLAN.md"
                    tasks = repo / ".artifacts" / slug / "TASKS.md"
                    target = str(outputs / "REVIEW.md")
                    self.assertEqual(run["cwd"], str(repo))
                    self.assertEqual(run["plan"], str(plan))
                    self.assertEqual(run["tasks"], str(tasks))
                    self.assertEqual(run["target"], target)
                    self.assertEqual(run["prompt"], case["prompt"].format(
                        plan=plan, tasks=tasks, target=target, baseRef=run["baseRef"]))
                    self.assertNotIn("{plan}", run["prompt"])
                    self.assertNotIn("{tasks}", run["prompt"])
                    self.assertNotIn("{target}", run["prompt"])
                    self.assertNotIn("{baseRef}", run["prompt"])
                    self.assertTrue(Path(run["cwd"]).is_absolute())
                    self.assertTrue((repo / ".git").is_dir())
                    self.assertEqual(list(outputs.iterdir()), [])
                    self.assertNotIn("assertions", run)
                    self.assertNotIn("expected_output", run)
                    refs.append(run["baseRef"])
                    # Base commit exists; worktree overlay is uncommitted.
                    head = subprocess.run(
                        ["git", "rev-parse", "HEAD"], cwd=repo,
                        capture_output=True, text=True)
                    self.assertEqual(head.returncode, 0)
                    self.assertEqual(head.stdout.strip(), run["baseRef"])
                    status = subprocess.run(
                        ["git", "status", "--porcelain"], cwd=repo,
                        capture_output=True, text=True)
                    self.assertEqual(status.returncode, 0)
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
                    combined = b"\n".join(blobs.values()).decode("utf-8")
                    for hidden in (case["expected_output"], *case["assertions"]):
                        self.assertNotIn(hidden, combined)
                    for forbidden in ("eval_metadata.json", "run.json", "evals.json", "SKILL.md"):
                        self.assertFalse(list(repo.rglob(forbidden)))
                    inventories.append(blobs)
                self.assertEqual(inventories[0], inventories[1])
                self.assertEqual(refs[0], refs[1])

    def test_case_shapes(self):
        prepare.prepare(self.workspace, range(1, 12))
        # Case 2: no source change; T1 checked but unimplemented.
        run2 = self.run_data(2)
        repo2 = Path(run2["cwd"])
        self.assertIn("tag:", (repo2 / "app.mjs").read_text())
        self.assertIn("- [x] T1", (repo2 / ".artifacts/checked-not-met/TASKS.md").read_text())
        status2 = subprocess.run(
            ["git", "status", "--porcelain"], cwd=repo2,
            capture_output=True, text=True).stdout
        self.assertNotIn("app.mjs", status2)
        # Case 3: non-goal uppercase present.
        repo3 = Path(self.run_data(3)["cwd"])
        self.assertIn("toUpperCase", (repo3 / "impl.mjs").read_text())
        # Case 4: export chain rewritten.
        repo4 = Path(self.run_data(4)["cwd"])
        self.assertIn("prefix =", (repo4 / "api.mjs").read_text())
        # Case 5: missing tasks with decoy present.
        run5 = self.run_data(5)
        repo5 = Path(run5["cwd"])
        self.assertFalse(Path(run5["tasks"]).exists())
        decoys = list(repo5.rglob(".artifacts/decoy/TASKS.md"))
        self.assertEqual(len(decoys), 1)
        # Case 6: manual TUI acceptance present.
        repo6 = Path(self.run_data(6)["cwd"])
        self.assertIn("tmux TUI", (repo6 / ".artifacts/manual-unverified/TASKS.md").read_text())
        # Case 8: deferred docs unchecked with block note.
        repo8 = Path(self.run_data(8)["cwd"])
        tasks8 = (repo8 / ".artifacts/deferred-docs/TASKS.md").read_text()
        self.assertIn("- [ ] T2", tasks8)
        self.assertIn("Deferred", tasks8)
        self.assertIn("tag:", (repo8 / "docs/labels.md").read_text())
        # Case 9: lbl: implementation; T3 supersedes the label: criteria.
        repo9 = Path(self.run_data(9)["cwd"])
        self.assertIn('"lbl:"', (repo9 / "app.mjs").read_text())
        self.assertIn('"lbl:blue"', (repo9 / "docs/labels.md").read_text())
        self.assertIn("Revision 1", (repo9 / ".artifacts/prefix-revision/PLAN.md").read_text())
        tasks9 = (repo9 / ".artifacts/prefix-revision/TASKS.md").read_text()
        for task in ("T1", "T2", "T3"):
            self.assertIn(f"- [x] {task}", tasks9)
        self.assertIn("Supersedes", tasks9)
        # Case 10: untracked handoff test, insufficient handoff evidence.
        repo10 = Path(self.run_data(10)["cwd"])
        self.assertIn('"label:"', (repo10 / "app.mjs").read_text())
        self.assertIn("label:blue", (repo10 / "test/previewLabel.test.mjs").read_text())
        tasks10 = (repo10 / ".artifacts/test-first-prefix/TASKS.md").read_text()
        self.assertIn("Handoff evidence: Added the test and ran the tests.", tasks10)
        status10 = subprocess.run(
            ["git", "status", "--porcelain", "--untracked-files=all"], cwd=repo10,
            capture_output=True, text=True).stdout
        self.assertIn("?? test/previewLabel.test.mjs", status10)
        # Case 11: the newest artifacts directory has no TASKS.md.
        repo11 = Path(self.run_data(11)["cwd"])
        folders = sorted((repo11 / ".artifacts").iterdir(), key=lambda path: path.stat().st_mtime)
        self.assertEqual([path.name for path in folders], ["docs-refresh", "prefix-rollout", "casing-followup"])
        self.assertFalse((folders[-1] / "TASKS.md").exists())
        self.assertTrue((folders[1] / "TASKS.md").is_file())

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
        self.assertIn("label:", (old_repo / "app.mjs").read_text())

    def test_base_refs_are_the_same_across_preparations(self):
        prepare.prepare(self.workspace, [1, 10])
        other = self.root / "other"
        prepare.prepare(other, [1, 10])
        for case_id in (1, 10):
            slug = prepare.CASES[case_id]
            with self.subTest(case=case_id):
                again = json.loads((other / f"eval-{case_id}-{slug}" / "with_skill" / "run.json").read_text())
                self.assertEqual(self.run_data(case_id)["baseRef"], again["baseRef"])

    def test_existing_workspace_is_never_overwritten(self):
        prepare.prepare(self.workspace, [1])
        run = self.run_data(1)
        before = prepare.input_manifest(Path(run["cwd"]))
        with self.assertRaisesRegex(ValueError, "already exists"):
            prepare.prepare(self.workspace, [2])
        self.assertEqual(prepare.input_manifest(Path(run["cwd"])), before)
        self.assertEqual(len(list(self.workspace.iterdir())), 1)

    def test_invalid_ids_do_not_create_workspace(self):
        for ids in ([], [0], [12], [1, 1], [1, 999], ["../escape"], [True], [1.0]):
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
