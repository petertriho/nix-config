#!/usr/bin/env python3
"""Regression tests: python3 test_configure.py /absolute/package/output [--integration].

Default tests use a JSON-driven runtime shim; only --help runs the real binary.
Integration requires a non-root NixOS session (upstream takes its /run/user lock).
All configuration/credentials are temporary. Never pass --yes to real setup.
"""

import argparse
import json
import os
from pathlib import Path
import pty
import shutil
import subprocess
import sys
import tempfile
import unittest

SERVICES = (
    "LG Buddy: Service setup incomplete: This installation does not support automatic service setup.\n"
    "Details: declaratively managed or immutable system\n"
)
MIGRATE = "settings set tv.platform lg_webos"
START = "sudo systemctl start lg-buddy.service lg-buddy-lifecycle.service"
TOKEN = '{"access_token":"synthetic-test-token"}'
PACKAGE = None
INTEGRATION = False
SHIM = r"""
import json, os, sys
from pathlib import Path
with open(os.environ["TEST_ARGV_LOG"], "a") as log:
    log.write(json.dumps({"program": sys.argv[0], "argv": sys.argv[1:]}) + "\n")
if Path(sys.argv[0]).name not in ("runtime shim", "lg-buddy"):
    sys.exit("Forbidden external command: " + sys.argv[0])
state = json.loads(Path(os.environ["TEST_FIXTURE"]).read_text())
if sys.argv[1:2] == ["setup"]:
    print(state["stdout"], end="", flush=True)
    print(state["stderr"], end="", file=sys.stderr, flush=True)
    sys.exit(state["code"])
if sys.argv[1:] == ["settings", "get", "tv.platform"]:
    print(state["platform"])
    sys.exit(state["settings_code"])
sys.exit("Unexpected runtime invocation")
"""


class Fixture(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="lg-buddy-configure-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.home = self.root / "home"
        self.home.mkdir()
        self.empty_path = self.root / "empty-path"
        self.empty_path.mkdir()
        self.log = self.root / "argv.jsonl"
        self.fixture = self.root / "fixture.json"
        self.shim = self.root / "runtime shim"
        self.shim.write_text(f"#!{sys.executable}\n" + SHIM)
        self.shim.chmod(0o755)
        commands = self.root / "commands"
        commands.mkdir()
        for name in ("systemctl", "journalctl", "nm-online", "sudo", "reboot", "bscpylgtvcommand"):
            (commands / name).symlink_to(self.shim)
        # Deliberately do not inherit LG_BUDDY_*, SUDO_*, display or bus variables.
        self.env = {
            "HOME": str(self.home), "XDG_CONFIG_HOME": str(self.home / "xdg"),
            "XDG_RUNTIME_DIR": str(self.root), "XDG_CACHE_HOME": str(self.home / "cache"),
            "XDG_DATA_HOME": str(self.home / "data"), "TMPDIR": str(self.root),
            "PATH": str(commands) + os.pathsep + os.environ.get("PATH", ""),
            "LANG": "C", "TERM": "dumb", "LG_BUDDY_RUNTIME_BINARY": str(self.shim),
            "TEST_FIXTURE": str(self.fixture), "TEST_ARGV_LOG": str(self.log),
        }
        for variable, command in (
            ("SYSTEMCTL", "systemctl"), ("JOURNALCTL", "journalctl"),
            ("NM_ONLINE", "nm-online"), ("BSCPYLGTV_COMMAND", "bscpylgtvcommand"),
        ):
            self.env["LG_BUDDY_" + variable] = str(commands / command)
        self.wrapper = PACKAGE / "bin/lg-buddy-configure"
        self.state()

    def state(self, code=0, platform="lg_webos", stdout="", stderr="", settings_code=0):
        self.fixture.write_text(json.dumps(dict(
            code=code, platform=platform, stdout=stdout, stderr=stderr,
            settings_code=settings_code,
        )))
        self.log.unlink(missing_ok=True)

    def invoke(self, *args, real=False, tty=False):
        env = self.env.copy()
        if real:
            env.pop("LG_BUDDY_RUNTIME_BINARY", None)
            self.assertNotIn("--yes", args)
            self.assertNotIn("-y", args)
            self.assertNotEqual(env.get("LG_BUDDY_NONINTERACTIVE"), "1")
        kwargs = dict(env=env, cwd=self.root, stdout=subprocess.PIPE,
                      stderr=subprocess.STDOUT, text=True, timeout=15)
        if tty:
            master, slave = pty.openpty()
            try:
                os.write(master, b"q\n")
                result = subprocess.run([str(self.wrapper), *args], stdin=slave, **kwargs)
            finally:
                os.close(slave)
                os.close(master)
        else:
            result = subprocess.run([str(self.wrapper), *args], input="", **kwargs)
        return result

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def tearDown(self):
        for call in self.calls():
            self.assertIn(Path(call["program"]).name, ("runtime shim", "lg-buddy"), call)
            self.assertTrue(call["argv"][:1] == ["setup"] or
                            call["argv"] == ["settings", "get", "tv.platform"], call)

    def config(self, path=None, platform="lg_webos", token=TOKEN):
        path = path or self.home / ".config/lg-buddy/config.env"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"tvs_primary_platform={platform}\ntvs_primary_ip=192.0.2.42\n"
                        "tvs_primary_mac=02:00:00:00:00:01\ntvs_primary_input=HDMI_1\n")
        credential = path.parent / "tvs/primary/access-token.json"
        credential.unlink(missing_ok=True)
        if token is not None:
            credential.parent.mkdir(parents=True, exist_ok=True)
            credential.write_text(token)
            credential.chmod(0o600)
        return path

    def snapshot(self):
        return {str(p.relative_to(self.home)): p.read_bytes()
                for p in self.home.rglob("*") if p.is_file()}

    def status(self, result, code, hint=False):
        self.assertEqual(result.returncode, code, result.stdout)
        self.assertEqual(MIGRATE in result.stdout, hint, result.stdout)

    def activation_guidance(self, result):
        self.status(result, 0)
        self.assertRegex(result.stdout.lower(), r"service activation (?:was not checked|has not been checked)")
        self.assertIn(START, result.stdout)
        self.assertIn("reboot", result.stdout.lower())


class ForwarderTests(Fixture):
    def test_real_help_headless_with_normal_and_empty_path(self):
        for path in (self.env["PATH"], str(self.empty_path)):
            with self.subTest(path=path):
                self.env["PATH"] = path
                result = self.invoke("--help", real=True)
                self.status(result, 0)
                self.assertIn("setup [OPTIONS]", result.stdout)
                self.assertEqual(self.calls(), [])

    def test_override_preseed_and_literal_argv(self):
        self.env.update(LG_BUDDY_NONINTERACTIVE="1",
                        LG_BUDDY_TV_IP="192.0.2.42 ; $(false)", LG_BUDDY_TV_MAC="02:00:00:00:00:01",
                        LG_BUDDY_INPUT="HDMI_2")
        extra = ["--custom", "two words", "", "* ' \" $HOME"]
        for path in (self.env["PATH"], str(self.empty_path)):
            with self.subTest(path=path):
                self.state()
                self.env["PATH"] = path
                self.status(self.invoke(*extra), 0)
                self.assertEqual([c["argv"] for c in self.calls()], [[
                    "setup", "--non-interactive", "--yes", "--tv-ip", self.env["LG_BUDDY_TV_IP"],
                    "--tv-mac", self.env["LG_BUDDY_TV_MAC"], "--input", "HDMI_2", *extra,
                ]])

    def test_noninteractive_requires_exact_one(self):
        for value in ("", "0", "true"):
            with self.subTest(value=value):
                self.state()
                self.env["LG_BUDDY_NONINTERACTIVE"] = value
                self.status(self.invoke("--help"), 0)
                self.assertEqual([c["argv"] for c in self.calls()], [["setup", "--help"]])

    def test_sibling_selection_then_path_fallback(self):
        directory = self.root / "copied bin"
        directory.mkdir()
        self.wrapper = directory / "lg-buddy-configure"
        shutil.copy2(PACKAGE / "bin/lg-buddy-configure", self.wrapper)
        sibling = directory / "lg-buddy"
        sibling.symlink_to(self.shim)
        fallback = self.root / "commands/lg-buddy"
        fallback.symlink_to(self.shim)
        for expected in (sibling, fallback):
            with self.subTest(expected=expected):
                self.state()
                self.status(self.invoke("--help", real=True), 0)
                self.assertEqual(self.calls(), [{"program": str(expected), "argv": ["setup", "--help"]}])
                sibling.unlink(missing_ok=True)

    def test_invalid_explicit_override_does_not_fall_back(self):
        for path in (self.root / "absent", self.fixture):
            with self.subTest(path=path):
                self.env["LG_BUDDY_RUNTIME_BINARY"] = str(path)
                self.status(self.invoke(), 1)
                self.assertEqual(self.calls(), [])

    def test_exit_codes_and_both_output_streams(self):
        self.config()  # A nonempty token must not mask any unrelated failure.
        for platform in ("lg_webos", "bscpylgtv"):
            for code in (0, 1, 2, 3, 130):
                for diagnostic in ("ordinary failure\n", SERVICES):
                    if code == 1 and platform == "lg_webos" and diagnostic == SERVICES:
                        continue
                    with self.subTest(platform=platform, code=code, diagnostic=diagnostic):
                        self.state(code, platform, stdout="stdout-marker\n", stderr=diagnostic)
                        result = self.invoke()
                        self.status(result, code, hint=code == 1 and platform == "bscpylgtv")
                        self.assertIn("stdout-marker", result.stdout)
                        self.assertIn(diagnostic, result.stdout)

    def test_native_services_success_does_not_guess_credential_path(self):
        # Upstream reaching Services establishes readiness; no shell-visible token required.
        for stream in ("stdout", "stderr"):
            with self.subTest(stream=stream):
                self.state(1, **{stream: SERVICES})
                self.activation_guidance(self.invoke())

    def test_only_exact_services_diagnostic_is_normalized(self):
        self.config(token="{malformed but nonempty")
        header, detail = SERVICES.splitlines()
        for diagnostic in (
            detail, header, "prefix " + SERVICES, SERVICES.replace(detail, detail + " extra"),
            SERVICES.replace(header, "LG Buddy: TV setup incomplete: malformed native credential"),
            SERVICES.replace(detail, "Details: other service failure"),
        ):
            with self.subTest(diagnostic=diagnostic):
                self.state(1, stderr=diagnostic + "\n")
                self.status(self.invoke(), 1)

    def test_failed_platform_lookup_cannot_certify_success(self):
        self.config()
        self.state(1, stderr=SERVICES, settings_code=1)
        self.status(self.invoke(), 1)

    def test_legacy_hint_with_or_without_old_key_and_without_mutation(self):
        config = self.config(platform="bscpylgtv", token=None)
        key = config.parent / ".aiopylgtv.sqlite"
        for present in (False, True):
            if present:
                key.write_bytes(b"synthetic legacy credential")
            for diagnostic in ("LG Buddy: TV setup incomplete: credential missing\n", SERVICES):
                with self.subTest(key_present=present, diagnostic=diagnostic):
                    self.state(1, "bscpylgtv", stderr=diagnostic)
                    before = self.snapshot()
                    self.status(self.invoke(), 1, hint=True)
                    self.assertEqual(self.snapshot(), before)


class IntegrationTests(Fixture):
    def setUp(self):
        if not INTEGRATION:
            self.skipTest("enable with --integration")
        runtime = Path(f"/run/user/{os.getuid()}")
        if os.geteuid() == 0 or not Path("/etc/NIXOS").exists() or not os.access(runtime, os.W_OK):
            self.skipTest("requires non-root NixOS and writable /run/user/UID")
        # This upstream global pointer outranks XDG; do not read a live installation.
        if Path("/usr/lib/lg-buddy/config-path").exists():
            self.skipTest("live upstream config pointer would override temporary HOME/XDG")
        super().setUp()

    def real_setup(self, *args, tty=False):
        before = self.snapshot()
        result = self.invoke(*args, real=True, tty=tty)
        self.assertEqual(self.snapshot(), before, result.stdout)
        self.assertNotIn("Connecting to the TV", result.stdout)
        self.assertEqual(self.calls(), [], "real setup must not invoke service/network helpers")
        return result

    def test_native_stored_readiness_and_config_precedence(self):
        for location in ("default", "xdg", "explicit"):
            with self.subTest(location=location):
                shutil.rmtree(self.home)
                self.home.mkdir()
                self.env.pop("LG_BUDDY_CONFIG", None)
                self.env.pop("XDG_CONFIG_HOME", None)
                default = self.config(platform="bscpylgtv", token=None)
                if location == "default":
                    self.config(default)
                else:
                    xdg = self.home / "xdg"
                    self.env["XDG_CONFIG_HOME"] = str(xdg)
                    self.config(xdg / "lg-buddy/config.env",
                                platform="lg_webos" if location == "xdg" else "bscpylgtv")
                    if location == "explicit":
                        self.env["LG_BUDDY_CONFIG"] = str(self.config(self.home / "custom path/config.env"))
                self.activation_guidance(self.real_setup("--non-interactive"))

    def test_native_missing_and_malformed_credentials_need_consent(self):
        for token in (None, "{not json", '{"access_token":""}'):
            with self.subTest(token=token):
                self.env["LG_BUDDY_CONFIG"] = str(self.config(token=token))
                result = self.real_setup("--non-interactive")
                self.status(result, 3)
                self.assertIn("Use --yes to approve pairing", result.stdout)

    def test_legacy_states_offer_migration_without_mutation(self):
        config = self.config(platform="bscpylgtv", token=None)
        self.env["LG_BUDDY_CONFIG"] = str(config)
        for present in (False, True):
            with self.subTest(key_present=present):
                if present:
                    (config.parent / ".aiopylgtv.sqlite").write_bytes(b"synthetic legacy credential")
                self.status(self.real_setup("--non-interactive"), 1, hint=True)

    def test_empty_config_invalid_flag_and_tty_cancellation(self):
        config = self.config(token=None)
        config.write_text("")
        self.env["LG_BUDDY_CONFIG"] = str(config)
        for args, tty, code in ((("--non-interactive",), False, 3),
                                (("--not-a-real-flag",), False, 2), ((), True, 130)):
            with self.subTest(args=args, tty=tty):
                self.status(self.real_setup(*args, tty=tty), code)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("--integration", action="store_true")
    options = parser.parse_args()
    PACKAGE, INTEGRATION = options.package, options.integration
    if not PACKAGE.is_absolute() or not (PACKAGE / "bin/lg-buddy-configure").is_file():
        parser.error("package must be an absolute built package output containing bin/lg-buddy-configure")
    unittest.main(argv=[sys.argv[0]], verbosity=2)
