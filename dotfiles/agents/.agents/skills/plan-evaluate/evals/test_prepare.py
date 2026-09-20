"""Offline fixture-construction tests, not model evaluation or grading."""

import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest

import prepare


HERE = Path(__file__).resolve().parent


class PrepareTests(unittest.TestCase):
    def setUp(self):
        # Keep even transient writes inside this checkout's evals directory.
        self.temp = tempfile.TemporaryDirectory(prefix=".test-fixtures-", dir=HERE)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"

    def run_data(self, case_id, variant="with_skill"):
        slug = prepare.CASES[case_id][0]
        path = self.workspace / f"eval-{case_id}-{slug}" / variant / "run.json"
        return json.loads(path.read_text(encoding="utf-8"))

    def test_eval_schema_and_short_plans(self):
        evals = prepare.load_evals()
        self.assertEqual(set(evals), set(range(1, 12)))
        self.assertEqual(len(prepare.CASES), len(evals))
        raw = json.loads((HERE / "evals.json").read_text(encoding="utf-8"))
        self.assertEqual(raw["skill_name"], "plan-evaluate")
        self.assertEqual(len(raw["evals"]), len(evals))  # No duplicate IDs.
        for case_id, case in evals.items():
            with self.subTest(case=case_id):
                self.assertEqual(set(case), {"id", "prompt", "expected_output", "files", "assertions"})
                self.assertEqual(case["files"], [])
                self.assertTrue(case["expected_output"])
                self.assertTrue(case["assertions"])
                self.assertTrue(all(isinstance(item, str) and item for item in case["assertions"]))
                self.assertIn("{plan}", case["prompt"])
                self.assertEqual("{target}" in case["prompt"], case_id != 9)
                slug, plan = prepare.CASES[case_id]
                self.assertRegex(slug, r"^[a-z]+(?:-[a-z]+)*$")
                if case_id not in (7, 8, 9):
                    self.assertGreaterEqual(len(plan.split()), 150)
                    self.assertLessEqual(len(plan.split()), 250)

    def test_all_pairs_paths_bytes_hashes_links_and_metadata(self):
        prepare.prepare(self.workspace, range(1, 12))
        self.assertEqual(len(list(self.workspace.iterdir())), 11)
        for case_id, case in prepare.load_evals().items():
            with self.subTest(case=case_id):
                slug = prepare.CASES[case_id][0]
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
                    target = None if case_id == 9 else str(outputs / "EVALUATION.md")
                    self.assertEqual(run["cwd"], str(repo))
                    self.assertEqual(run["plan"], str(plan))
                    self.assertEqual(run["target"], target)
                    self.assertEqual(run["prompt"], case["prompt"].format(plan=plan, target=target))
                    self.assertNotIn("{plan}", run["prompt"])
                    self.assertNotIn("{target}", run["prompt"])
                    self.assertTrue(Path(run["cwd"]).is_absolute())
                    self.assertTrue(Path(run["plan"]).is_absolute())
                    self.assertEqual(list(outputs.iterdir()), [])
                    self.assertFalse((repo / ".git").exists())
                    self.assertNotIn("assertions", run)
                    self.assertNotIn("expected_output", run)
                    # Independently inspect raw bytes and link text, not only the helper.
                    blobs, links, modes = {}, {}, {}
                    for path in repo.rglob("*"):
                        name = path.relative_to(repo).as_posix()
                        if path.is_symlink():
                            links[name] = os.readlink(path)
                            self.assertTrue(path.resolve(strict=True).is_relative_to(repo))
                        elif path.is_file():
                            blobs[name] = path.read_bytes()
                            modes[name] = stat.S_IMODE(path.stat().st_mode)
                    self.assertEqual(run["fixture_input_hashes"], {
                        name: hashlib.sha256(data).hexdigest() for name, data in blobs.items()
                    })
                    self.assertEqual(run["symlink_targets"], links)
                    self.assertEqual(links, prepare.SYMLINKS)
                    for name in links:
                        self.assertEqual((repo / name).resolve(strict=True), repo / "impl.mjs")
                    self.assertIn("./links/current.mjs", (repo / "api.mjs").read_text())
                    for key, value in prepare.input_manifest(repo).items():
                        self.assertEqual(run[key], value)
                    inventories.append((blobs, links, modes))
                    # Grading material and snapshots must not enter subject inputs.
                    combined = b"\n".join(blobs.values()).decode("utf-8")
                    for hidden in (case["expected_output"], *case["assertions"]):
                        self.assertNotIn(hidden, combined)
                    for forbidden in ("eval_metadata.json", "run.json", "evals.json", "SKILL.md"):
                        self.assertFalse(list(repo.rglob(forbidden)))
                self.assertEqual(inventories[0], inventories[1])

    def test_empty_missing_decoy_status_and_future_script(self):
        prepare.prepare(self.workspace, [3, 4, 7, 8, 9, 10, 11])
        for variant in ("old_skill", "with_skill"):
            empty = self.run_data(7, variant)
            self.assertEqual(Path(empty["plan"]).read_bytes(), b"")
            empty_name = Path(empty["plan"]).relative_to(empty["cwd"]).as_posix()
            self.assertEqual(empty["fixture_input_hashes"][empty_name], hashlib.sha256(b"").hexdigest())
            for case_id in (8, 9):
                run = self.run_data(case_id, variant)
                self.assertFalse(Path(run["plan"]).exists())
                plans = list(Path(run["cwd"]).rglob("PLAN.md"))
                self.assertEqual(len(plans), 1 if case_id == 8 else 0)
                if case_id == 8:
                    self.assertEqual(plans[0].relative_to(run["cwd"]).as_posix(), ".artifacts/decoy/PLAN.md")
                    self.assertEqual(plans[0].read_text(), prepare.CLEAN_PLAN)
            self.assertIsNone(self.run_data(9, variant)["target"])
            self.assertFalse((Path(self.run_data(4, variant)["cwd"]) / "scripts/check.mjs").exists())
            draft = Path(self.run_data(3, variant)["plan"]).read_text()
            self.assertIn("Status: Draft\nThe heading decision Q1", draft)
            self.assertNotIn("Status:", Path(self.run_data(10, variant)["plan"]).read_text())
            repo = Path(self.run_data(11, variant)["cwd"])
            script = repo / "scripts/check"
            self.assertTrue(script.stat().st_mode & stat.S_IXUSR)
            self.assertLess(script.read_text().index(".check-invoked"), script.read_text().index('case "${1-}"'))
            self.assertFalse((repo / ".check-invoked").exists())

    def test_manifest_detects_mutations_added_files_and_link_retargeting(self):
        prepare.prepare(self.workspace, [11])
        run = self.run_data(11)
        repo = Path(run["cwd"])
        (repo / "app.mjs").write_text("// changed\n")
        # Simulate the marker without ever executing the fixture helper.
        (repo / ".check-invoked").write_text("invoked\n")
        link = repo / "links/current.mjs"
        link.unlink()
        link.symlink_to("../impl.mjs")
        manifest = prepare.input_manifest(repo)
        self.assertNotEqual(manifest["fixture_input_hashes"]["app.mjs"], run["fixture_input_hashes"]["app.mjs"])
        self.assertIn(".check-invoked", manifest["fixture_input_hashes"])
        self.assertNotEqual(manifest["symlink_targets"], run["symlink_targets"])
        old_repo = Path(self.run_data(11, "old_skill")["cwd"])
        self.assertEqual((old_repo / "app.mjs").read_text(), prepare.SOURCES["app.mjs"])
        self.assertFalse((old_repo / ".check-invoked").exists())

    def test_existing_workspace_is_never_overwritten(self):
        prepare.prepare(self.workspace, [1])
        run = self.run_data(1)
        before = prepare.input_manifest(Path(run["cwd"]))
        with self.assertRaisesRegex(ValueError, "already exists"):
            prepare.prepare(self.workspace, [2])
        self.assertEqual(prepare.input_manifest(Path(run["cwd"])), before)
        self.assertEqual(len(list(self.workspace.iterdir())), 1)
        for kind in ("directory", "file", "symlink", "dangling"):
            with self.subTest(kind=kind):
                path = self.root / kind
                if kind == "directory":
                    path.mkdir()
                elif kind == "file":
                    path.write_text("keep me")
                else:
                    path.symlink_to(self.workspace if kind == "symlink" else self.root / "absent")
                with self.assertRaisesRegex(ValueError, "already exists"):
                    prepare.prepare(path, [1])
                self.assertTrue(os.path.lexists(path))
        self.assertEqual((self.root / "file").read_text(), "keep me")

    def test_invalid_ids_do_not_create_workspace(self):
        for ids in ([], [0], [12], [1, 1], [1, 999], ["../escape"], [True], [1.0]):
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                prepare.prepare(self.workspace, ids)
            self.assertFalse(self.workspace.exists())

    def test_workspace_rejects_relative_traversal_and_symlink_ancestors(self):
        (self.root / "alias").symlink_to(self.root, target_is_directory=True)
        paths = [
            Path("relative-workspace"),
            self.root / "child" / ".." / "escape",
            self.root / "alias" / "escape",
            self.root / "missing-parent" / "workspace",
        ]
        for path in paths:
            with self.subTest(path=path), self.assertRaises(ValueError):
                prepare.prepare(path, [1])
        self.assertFalse((self.root / "escape").exists())
        self.assertFalse((self.root / "missing-parent").exists())

    def test_file_writes_reject_traversal_escape_links_and_overwrites(self):
        repo = self.root / "repo"
        repo.mkdir()
        for name in ("../escape", "/absolute-escape", "sub/../../escape", "."):
            with self.subTest(name=name), self.assertRaises(ValueError):
                prepare.write_file(repo, name, "must not be written")
        (repo / "outside").symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(ValueError):
            prepare.write_file(repo, "outside/escape", "must not be written")
        prepare.write_file(repo, "keep", "original")
        with self.assertRaises(FileExistsError):
            prepare.write_file(repo, "keep", "overwrite")
        self.assertEqual((repo / "keep").read_text(), "original")
        self.assertFalse((self.root / "escape").exists())

    def test_manifest_rejects_links_outside_fixture(self):
        prepare.prepare(self.workspace, [1])
        repo = Path(self.run_data(1)["cwd"])
        (repo / "escape").symlink_to(self.root / "outside")
        (self.root / "outside").write_text("outside fixture")
        with self.assertRaisesRegex(ValueError, "symlink leaves fixture"):
            prepare.input_manifest(repo)

    def test_cli_selected_cases_and_rejections(self):
        command = [
            sys.executable, "-B", str(HERE / "prepare.py"),
            "--workspace", str(self.workspace), "--cases", "1", "9",
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), str(self.workspace))
        self.assertEqual(len(list(self.workspace.iterdir())), 2)
        repeated = subprocess.run(command, capture_output=True, text=True)
        self.assertNotEqual(repeated.returncode, 0)
        self.assertIn("already exists", repeated.stderr)
        for bad_id in ("../escape", "12"):
            invalid = subprocess.run([
                sys.executable, "-B", str(HERE / "prepare.py"),
                "--workspace", str(self.root / "unused"), "--cases", bad_id,
            ], capture_output=True, text=True)
            self.assertNotEqual(invalid.returncode, 0)
            self.assertFalse((self.root / "unused").exists())


if __name__ == "__main__":
    unittest.main()
