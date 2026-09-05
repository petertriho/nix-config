"""Seven ported capability regressions plus fresh all-scenario checks.

No old generated fixtures, transcripts or Git histories are inputs.
"""
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "harness"))
from backend import dispatch
from build_fixtures import build, create_fixture, git, save, snapshot
from review import export, graded, prepare


def index_records(hex_data):
    """Decode synthetic SHA1 v2 index; staging identity checked separately."""
    data = bytes.fromhex(hex_data)
    magic, version, count = struct.unpack(">4sII", data[:12])
    if magic != b"DIRC" or version != 2:
        raise ValueError("Only v2 fixture indexes are decoded")
    offset, records = 12, {}
    keys = ["ctime_s", "ctime_ns", "mtime_s", "mtime_ns", "dev", "ino", "mode", "uid", "gid", "size"]
    for _ in range(count):
        start = offset
        stat = struct.unpack(">10I", data[offset:offset + 40])
        oid = data[offset + 40:offset + 60].hex()
        flags = struct.unpack(">H", data[offset + 60:offset + 62])[0]
        end = data.index(b"\0", offset + 62)
        name = data[offset + 62:end].decode()
        records[name] = {**dict(zip(keys, stat)), "oid": oid, "flags": flags}
        offset = start + ((end + 1 - start + 7) // 8) * 8
    return records


class HarnessChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.run = Path(self.temp.name) / "runs/eval-6/with_skill"
        create_fixture(self.run, 6)
        self.root = self.run / "fixture"
        (self.root / "preexisting-empty").mkdir()
        save(self.run / "initial-state.json", snapshot(self.root))

    def call(self, action, **args):
        return dispatch(self.run, "with_skill", action, args)

    def test_traversal_root_and_git_guard(self):
        before = snapshot(self.root)
        for path in ("", ".", "./", "../outside", "probe/../../outside", "/tmp", ".git", ".git/index"):
            for action in ("fixture_remove", "fixture_write", "fixture_read"):
                with self.subTest(path=path, action=action), self.assertRaises(ValueError):
                    self.call(action, path=path, content="x")
        self.assertEqual(before, snapshot(self.root))

    def test_symlinks_not_followed_or_listed(self):
        outside = Path(self.temp.name) / "outside"
        outside.mkdir()
        (outside / "secret").write_text("OUTSIDE_SENTINEL_39b1")
        (self.root / "link").symlink_to(outside, target_is_directory=True)
        (self.root / "filelink").symlink_to(outside / "secret")
        for path in ("link", "link/secret", "filelink"):
            for action in ("fixture_read", "fixture_write", "fixture_remove"):
                with self.subTest(path=path, action=action), self.assertRaises(ValueError):
                    self.call(action, path=path, content="x")
        self.assertFalse(any("link" in name for name in self.call("fixture_list")))
        state = self.call("fixture_state")
        self.assertEqual(state["symlinks"], ["filelink", "link"])
        self.assertNotIn("OUTSIDE_SENTINEL_39b1", json.dumps(state))
        self.assertEqual((outside / "secret").read_text(), "OUTSIDE_SENTINEL_39b1")

    def test_preexisting_and_unowned_guard(self):
        before = snapshot(self.root)
        for path in ("preexisting-empty", "sandbox", "sandbox/parser.py"):
            with self.assertRaises(ValueError):
                self.call("fixture_remove", path=path)
        self.assertEqual(before, snapshot(self.root))
        (self.root / "unowned").mkdir()
        with self.assertRaises(ValueError):
            self.call("fixture_remove", path="unowned")

    def test_nonempty_guard_and_full_restoration(self):
        before = snapshot(self.root)
        self.call("fixture_write", path="probe/nested/repro.py", content="print('x')\n")
        self.assertIn("probe/nested/", self.call("fixture_list"))
        for path in ("probe", "probe/nested"):
            with self.assertRaises(OSError):
                self.call("fixture_remove", path=path)
        for path in ("probe/nested/repro.py", "probe/nested", "probe"):
            self.call("fixture_remove", path=path)
        self.assertEqual(before, snapshot(self.root))
        self.assertEqual(json.loads((self.run / "owned-paths.json").read_text()), [])

    def test_staged_unstaged_untracked_and_empty_dirs_preserved(self):
        with (self.root / "README.md").open("a") as stream:
            stream.write("staged user note\n")
        git(self.root, "add", "README.md")
        with (self.root / "README.md").open("a") as stream:
            stream.write("unstaged user note\n")
        (self.root / "user-note").write_text("untracked\n")
        before = snapshot(self.root)
        save(self.run / "initial-state.json", before)
        self.call("fixture_write", path="probe/repro.py", content="print('x')\n")
        self.call("fixture_remove", path="probe/repro.py")
        self.call("fixture_remove", path="probe")
        after = snapshot(self.root)
        self.assertEqual(before, after)
        self.assertTrue(after["cached_diff"])
        self.assertTrue(after["worktree_diff"])

    def test_probe_controls_three_runs_and_directory_removal(self):
        before = snapshot(self.root)
        original = before["files"]["sandbox/parser.py"]
        self.call("fixture_write", path="probe/repro.py", content="from sandbox.parser import parse_timestamp\nfrom offline_stub import deliver\nprint(deliver(parse_timestamp('2026-08-28T10:00:00')))\nprint(deliver(parse_timestamp('2026-08-28T10:00:00+00:00')))\n")
        def execute():
            return self.call("fixture_command", command="python probe/repro.py")["output"]
        self.assertEqual(execute(), "False\nTrue\n")
        candidate = original.replace("return datetime.fromisoformat(value)", "dt = datetime.fromisoformat(value)\n    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt")
        self.call("fixture_write", path="sandbox/parser.py", content=candidate)
        self.assertEqual(execute(), "True\nTrue\n")
        self.call("fixture_write", path="sandbox/parser.py", content=original)
        self.assertEqual(execute(), "False\nTrue\n")
        with self.assertRaises(ValueError):
            execute()
        self.call("fixture_remove", path="probe/repro.py")
        self.call("fixture_remove", path="probe")
        self.assertEqual(before, snapshot(self.root))

    def test_optional_lock_refresh_is_stat_not_staging(self):
        before = snapshot(self.root)
        parser = self.root / "sandbox/parser.py"
        parser.write_text(parser.read_text())
        stat = parser.stat()
        os.utime(parser, ns=(stat.st_atime_ns, stat.st_mtime_ns + 2_000_000_000))
        self.assertEqual(before["index_hex"], snapshot(self.root)["index_hex"])
        subprocess.check_output(["git", "status", "--porcelain=v1"], cwd=self.root,
                                env={**os.environ, "GIT_OPTIONAL_LOCKS": "1", "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"})
        refreshed = snapshot(self.root)
        self.assertNotEqual(before["index_hex"], refreshed["index_hex"])
        for key in ("files", "directories", "index_entries", "cached_diff", "worktree_diff", "status"):
            self.assertEqual(before[key], refreshed[key])
        a, b = index_records(before["index_hex"]), index_records(refreshed["index_hex"])
        changes = {p: {k for k in a[p] if a[p][k] != b[p][k]} for p in a if a[p] != b[p]}
        self.assertTrue(changes)
        self.assertTrue(all(fields <= {"ctime_s", "ctime_ns", "mtime_s", "mtime_ns", "dev", "ino", "uid", "gid", "size"} for fields in changes.values()))


class ConstructionChecks(unittest.TestCase):
    def test_all_eight_paired_fixtures_and_private_evidence(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            skill = base / "skill"
            save(skill / "SKILL.md", "Test-only skill snapshot\n")
            save(skill / "references/example.md", "Reference\n")
            workspace = build(base / "workspace", skill, skill)
            for scenario in range(1, 9):
                a, b = [snapshot(workspace / "runs" / f"eval-{scenario}" / version / "fixture")
                        for version in ("with_skill", "old_skill")]
                for key in ("files", "directories", "symlinks", "index_entries", "cached_diff", "worktree_diff", "status"):
                    self.assertEqual(a[key], b[key])
            with self.assertRaises(FileExistsError):
                build(workspace, skill, skill)
            run = workspace / "runs/eval-8/with_skill"
            rows = dispatch(run, "with_skill", "log_query",
                            {"projection": "sanitized", "fields": ["id", "parent", "error"], "limit": 3})
            self.assertEqual(len(rows), 3)
            self.assertNotIn("SYNTHETIC_", json.dumps(rows))
            for path in ("../grader-only/raw-logs.json", "skill/evals/evals.json"):
                with self.assertRaises(ValueError):
                    dispatch(run, "with_skill", "fixture_read", {"path": path})
            with self.assertRaises(ValueError):
                dispatch(run, "with_skill", "log_query", {"projection": "raw", "fields": ["raw"], "limit": 3})
            self.assertEqual(dispatch(run, "with_skill", "fixture_read", {"path": "skill/SKILL.md"}), "Test-only skill snapshot")

    def test_review_rejects_pending_and_exports_fresh_decisions(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            save(base / "skill/SKILL.md", "Test-only snapshot\n")
            workspace = build(base / "workspace", base / "skill", base / "skill", [6])
            prepare(workspace)
            case = json.loads((workspace / "evals.json").read_text())["evals"][0]
            for version in ("with_skill", "old_skill"):
                run = workspace / "runs/eval-6" / version
                decisions = json.loads((run / "decisions.json").read_text())
                with self.assertRaises(ValueError):
                    graded(case, decisions)
                decisions["grader"] = "SYNTHETIC integration test, not a model evaluation"
                for row in decisions["assertions"]:
                    if row["status"] == "pending":
                        row.update(status="fail", evidence="Synthetic fixture-only test: no subject investigation executed.")
                save(run / "decisions.json", decisions)
                save(run / "completion.json", {"exit_code": 0, "timeout": False, "last_stop_reason": "stop", "fresh_no_parent": True})
                save(run / "final-state.json", snapshot(run / "fixture"))
                save(run / "timing.json", {"total_tokens": 0, "total_duration_seconds": 0})
                save(run / "tool-audit.jsonl", "")
                save(run / "transcript.json", [])
                save(run / "outputs/final.md", "Synthetic integration test only, no model run.")
            destination = export(workspace)
            grade = json.loads((destination / "eval-6/with_skill/run-1/grading.json").read_text())
            self.assertEqual(grade["summary"]["total"], 6)
            self.assertEqual(len(grade["not_evaluable"]), 1)
            self.assertEqual(grade["summary"]["passed"], 0)
            with self.assertRaises(FileExistsError):
                export(workspace)


if __name__ == "__main__":
    unittest.main(verbosity=2)
