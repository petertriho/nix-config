#!/usr/bin/env python3
"""Exercise the NixOS shell scripts with temporary config and fake TV/network tools.

Run from any directory: python3 pkgs/lg-buddy/tests/test_module.py
No live configuration, TV, network probes, or service actions are used.
"""

import json
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
import unittest


REPO = Path(__file__).resolve().parents[3]
OLD_MAC = "02:11:22:33:44:55"
NEW_MAC = "02:aa:bb:cc:dd:ee"
CONFIG = (
    "tvs_primary_ip=192.0.2.42\n"
    f"tvs_primary_mac={OLD_MAC}\n"
    "tvs_primary_input=HDMI_1\n"
    "tvs_primary_platform=lg_webos\n"
)


class ModuleScripts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="lg-buddy-module-test-")
        cls.addClassCleanup(cls.temp.cleanup)
        cls.root = Path(cls.temp.name)
        cls.home = cls.root / "home"
        cls.config = cls.home / ".config/lg-buddy/config.env"
        cls.config.parent.mkdir(parents=True)
        cls.history = cls.config.parent / "known_macs"
        cls.log = cls.root / "commands.log"
        cls.stub = cls.root / "stub"
        (cls.stub / "bin").mkdir(parents=True)
        cls.bash = shutil.which("bash")
        if not cls.bash:
            raise unittest.SkipTest("Bash is required")
        for name, body in {
            "lg-buddy": (
                'if [ "$1" = nm-pre-down ]; then\n'
                '  printf "LG_BUDDY_CONFIG=%s\\n" "${LG_BUDDY_CONFIG:-}"; exit 0\n'
                'fi\n'
                'printf "%s\\n" "${LG_BUDDY_STUB_OUTPUT:-LG Buddy Startup: No stored '
                'native TV credential; skipping unattended TV control.}"'
            ),
            "ping": "exit 0",
            "ip": (
                f'printf "%s\\n" "192.0.2.42 dev fixture lladdr {NEW_MAC} REACHABLE"'
            ),
            "nm-online": "exit 0",
            "wakeonlan": "exit 0",
            # Skip the privilege options and run the wrapped command.
            "setpriv": 'while [ "${1#--}" != "$1" ]; do shift; done\nexec "$@"',
        }.items():
            script = cls.stub / "bin" / name
            script.write_text(
                f"#!{cls.bash}\n"
                f'printf "%s %s\\n" {shlex.quote(name)} "$*" '
                f">> {shlex.quote(str(cls.log))}\n{body}\n"
            )
            script.chmod(0o755)
        expression = f"""
          let
            flake = builtins.getFlake {json.dumps(str(REPO))};
            base = flake.nixosConfigurations.AMD-PC.pkgs;
            module = import (builtins.toPath
              {json.dumps(str(REPO / "systems/nixos/AMD-PC/lg-buddy.nix"))}) {{
              lib = base.lib;
              config = {{
                homePath = {json.dumps(str(cls.home))};
                user = "fixture-user";
              }};
              pkgs = base // {{
                writeShellScript = name: text: text;
                lg-buddy = {json.dumps(str(cls.stub))};
                iputils = {json.dumps(str(cls.stub))};
                iproute2 = {json.dumps(str(cls.stub))};
                networkmanager = {json.dumps(str(cls.stub))};
                wakeonlan = {json.dumps(str(cls.stub))};
                util-linux = {json.dumps(str(cls.stub))};
              }};
            }};
            dispatchers = module.networking.networkmanager.dispatcherScripts;
          in {{
            scripts = {{
              mac = module.systemd.services.lg-buddy-mac-sync.serviceConfig.ExecStart;
              startup = module.systemd.services.lg-buddy.serviceConfig.ExecStart;
              pre_down = (builtins.head dispatchers).source;
            }};
            dispatcher_types = map (script: script.type) dispatchers;
            tmpfiles = module.systemd.tmpfiles.rules;
          }}
        """
        evaluated = subprocess.run(
            [
                "nix", "eval", "--impure", "--offline", "--no-write-lock-file",
                "--json", "--expr", expression,
            ],
            check=True, capture_output=True, text=True, timeout=120,
        )
        module = json.loads(evaluated.stdout)
        cls.dispatcher_types = module["dispatcher_types"]
        cls.tmpfiles = module["tmpfiles"]
        cls.scripts = {}
        for name, text in module["scripts"].items():
            path = cls.root / f"{name}.sh"
            path.write_text(text)
            subprocess.run([cls.bash, "-n", str(path)], check=True)
            cls.scripts[name] = path

    def setUp(self):
        self.config.write_text(CONFIG)
        self.history.unlink(missing_ok=True)
        self.log.write_text("")

    def run_script(self, name, *args, **env):
        return subprocess.run(
            [self.bash, str(self.scripts[name]), *args],
            env={
                "HOME": str(self.home),
                "LG_BUDDY_CONFIG": str(self.config),
                "PATH": "",
                **env,
            },
            capture_output=True, text=True, timeout=20,
        )

    def calls(self, tool):
        return [
            call for call in self.log.read_text().splitlines()
            if call.startswith(tool + " ")
        ]

    def test_mac_drift_only_prints_an_actionable_repair(self):
        result = self.run_script("mac")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("sudo -u ", result.stdout)
        command = shlex.split(result.stdout[result.stdout.index("sudo -u "):].strip())
        self.assertEqual(command[:4], ["sudo", "-u", "fixture-user", "--"])
        self.assertTrue(command[4].endswith("/bin/env"), command)
        self.assertEqual(
            command[5:],
            [
                f"LG_BUDDY_CONFIG={self.config}", str(self.stub / "bin/lg-buddy"),
                "settings", "set", "tv.mac", NEW_MAC,
            ],
        )
        self.assertEqual(self.config.read_text(), CONFIG)
        self.assertEqual(self.history.read_text(), NEW_MAC + "\n")
        self.assertNotIn("lg-buddy ", self.log.read_text())

    def test_startup_wakes_other_known_macs_without_changing_config(self):
        self.history.write_text(OLD_MAC.upper() + "\n" + NEW_MAC + "\n")
        result = self.run_script(
            "startup",
            LG_BUDDY_STUB_OUTPUT="LG Buddy Startup: TV turned on and set to HDMI_1.",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.calls("nm-online"), ["nm-online -q -t 60"])
        self.assertEqual(self.calls("wakeonlan"), [f"wakeonlan -q {NEW_MAC}"] * 3)
        self.assertEqual(self.calls("lg-buddy"), ["lg-buddy startup auto"])
        self.assertIn("TV turned on and set to HDMI_1.", result.stdout)
        self.assertNotIn("diagnostic", result.stderr)
        self.assertEqual(self.config.read_text(), CONFIG)

    def test_startup_sends_no_extra_packets_without_other_macs(self):
        self.history.write_text(OLD_MAC.upper() + "\n")
        result = self.run_script(
            "startup",
            LG_BUDDY_STUB_OUTPUT="LG Buddy Startup: TV turned on and set to HDMI_1.",
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.calls("nm-online"), [])
        self.assertEqual(self.calls("wakeonlan"), [])
        self.assertEqual(self.calls("lg-buddy"), ["lg-buddy startup auto"])

    def test_failed_startup_never_runs_a_pairing_capable_query(self):
        self.history.write_text(NEW_MAC + "\n")
        result = self.run_script("startup")
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        calls = self.log.read_text().splitlines()
        self.assertEqual(self.calls("lg-buddy"), ["lg-buddy startup auto"])
        self.assertIn("ip neigh show 192.0.2.42", calls)
        self.assertTrue(any(call.startswith("ping ") for call in calls), calls)
        self.assertIn("No stored native TV credential", result.stdout)
        self.assertIn("diagnostic after startup failure", result.stderr)
        self.assertIn("responds to ICMP", result.stderr)
        self.assertEqual(self.config.read_text(), CONFIG)

    def test_pre_down_hook_runs_lg_buddy_as_the_service_user(self):
        result = self.run_script("pre_down", "wlan0", "pre-down", LG_BUDDY_CONFIG="")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            self.calls("setpriv"),
            [
                "setpriv --reuid=fixture-user --regid=users --init-groups "
                f"{self.stub}/bin/lg-buddy nm-pre-down"
            ],
        )
        self.assertEqual(self.calls("lg-buddy"), ["lg-buddy nm-pre-down"])
        self.assertIn(f"LG_BUDDY_CONFIG={self.config}", result.stdout)

    def test_pre_down_hook_ignores_other_actions(self):
        result = self.run_script("pre_down", "wlan0", "up")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.log.read_text(), "")

    def test_service_user_owns_the_system_state_directory(self):
        self.assertIn("d /run/lg_buddy 0755 fixture-user users -", self.tmpfiles)
        self.assertEqual(self.dispatcher_types, ["pre-down"])

if __name__ == "__main__":
    unittest.main(verbosity=2)
