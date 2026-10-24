"""Tests for the state logic of keymods.py.

From the repository root, run the tests with a Python that has evdev:

    nix shell --impure --expr \
      'with import <nixpkgs> {}; python3.withPackages (p: [ p.evdev ])' \
      -c python -m unittest discover pkgs/keymods/tests

`nix build .#keymods.tests.unit` runs them too. It sets KEYMODS_SCRIPT,
because the store copy of this directory has no keymods.py next to it.
"""

import importlib.util
import json
import os
import unittest
from pathlib import Path
from unittest import mock

SCRIPT = os.environ.get(
    "KEYMODS_SCRIPT",
    str(Path(__file__).resolve().parent.parent / "keymods.py"),
)
spec = importlib.util.spec_from_file_location("keymods", SCRIPT)
keymods = importlib.util.module_from_spec(spec)
spec.loader.exec_module(keymods)
e = keymods.ecodes

KANATA = 13
MOUSE = 16


def line(state):
    result = state.flush()
    return None if result is None else json.loads(result)


class ModStateTest(unittest.TestCase):
    def setUp(self):
        self.state = keymods.ModState()

    def press(self, code, device=KANATA):
        self.state.key(device, code, 1)

    def release(self, code, device=KANATA):
        self.state.key(device, code, 0)

    def test_no_output_while_mod_is_up(self):
        self.assertIsNone(line(self.state))
        for code in (e.KEY_H, e.KEY_LEFTCTRL, e.KEY_LEFTSHIFT, e.BTN_LEFT):
            self.press(code)
            self.assertIsNone(line(self.state))
            self.release(code)
            self.assertIsNone(line(self.state))
        self.state.scroll(e.REL_WHEEL)
        self.assertIsNone(line(self.state))
        self.assertEqual(self.state.seq, 0)

    def test_mod_down_then_up(self):
        self.press(e.KEY_LEFTMETA)
        self.assertEqual(
            line(self.state),
            {
                "mod": True,
                "ctrl": False,
                "alt": False,
                "shift": False,
                "held": 0,
                "seq": 0,
            },
        )
        self.assertIsNone(line(self.state))
        self.release(e.KEY_LEFTMETA)
        self.assertEqual(line(self.state)["mod"], False)
        self.assertIsNone(line(self.state))

    def test_mod_with_other_modifiers(self):
        self.press(e.KEY_LEFTMETA)
        self.press(e.KEY_LEFTSHIFT)
        self.press(e.KEY_RIGHTCTRL)
        self.press(e.KEY_LEFTALT)
        state = line(self.state)
        self.assertTrue(state["shift"] and state["ctrl"] and state["alt"])
        self.assertEqual(state["held"], 0)
        self.assertEqual(state["seq"], 0)

    def test_release_of_mod_hides_other_modifiers(self):
        self.press(e.KEY_LEFTMETA)
        self.press(e.KEY_LEFTSHIFT)
        line(self.state)
        self.release(e.KEY_LEFTMETA)
        self.assertEqual(
            line(self.state),
            {
                "mod": False,
                "ctrl": False,
                "alt": False,
                "shift": False,
                "held": 0,
                "seq": 0,
            },
        )

    def test_chord_while_mod_is_held(self):
        self.press(e.KEY_LEFTMETA)
        line(self.state)
        self.press(e.KEY_H)
        self.assertEqual(line(self.state)["held"], 1)
        self.assertEqual(self.state.seq, 1)
        self.release(e.KEY_H)
        state = line(self.state)
        self.assertEqual(state["held"], 0)
        self.assertEqual(state["seq"], 1)

    def test_mouse_button_and_wheel_are_chords(self):
        self.press(e.KEY_LEFTMETA)
        self.press(e.BTN_LEFT, MOUSE)
        self.assertEqual(line(self.state)["held"], 1)
        self.release(e.BTN_LEFT, MOUSE)
        self.state.scroll(e.REL_WHEEL)
        self.state.scroll(e.REL_X)
        state = line(self.state)
        self.assertEqual(state["held"], 0)
        self.assertEqual(state["seq"], 2)

    def test_touchpad_contact_is_not_a_chord(self):
        self.press(e.KEY_LEFTMETA)
        line(self.state)
        self.press(e.BTN_TOUCH, MOUSE)
        self.press(e.BTN_TOOL_FINGER, MOUSE)
        self.assertIsNone(line(self.state))

    def test_autorepeat_is_ignored(self):
        self.press(e.KEY_LEFTMETA)
        self.press(e.KEY_J)
        line(self.state)
        self.state.key(KANATA, e.KEY_J, 2)
        self.state.key(KANATA, e.KEY_LEFTMETA, 2)
        self.assertIsNone(line(self.state))
        self.assertEqual(self.state.seq, 1)

    def test_repeated_press_counts_once(self):
        self.press(e.KEY_LEFTMETA)
        self.press(e.KEY_J)
        self.press(e.KEY_J)
        self.assertEqual(self.state.seq, 1)

    def test_removed_device_releases_its_keys(self):
        self.press(e.KEY_LEFTMETA)
        self.press(e.BTN_LEFT, MOUSE)
        line(self.state)
        self.state.remove(MOUSE)
        self.assertEqual(line(self.state)["held"], 0)
        self.state.remove(KANATA)
        self.assertEqual(line(self.state)["mod"], False)

    def test_left_and_right_modifiers_merge(self):
        self.press(e.KEY_LEFTMETA, KANATA)
        self.press(e.KEY_RIGHTMETA, 14)
        line(self.state)
        self.release(e.KEY_LEFTMETA, KANATA)
        self.assertIsNone(line(self.state))
        self.release(e.KEY_RIGHTMETA, 14)
        self.assertEqual(line(self.state)["mod"], False)

    def test_resync_replaces_the_keys_of_a_device(self):
        self.press(e.KEY_LEFTMETA)
        self.press(e.KEY_H)
        line(self.state)
        self.state.resync(KANATA, [e.KEY_LEFTMETA, e.KEY_LEFTSHIFT])
        state = line(self.state)
        self.assertTrue(state["shift"])
        self.assertEqual(state["held"], 0)

    def test_current_line_for_a_new_client(self):
        self.assertEqual(json.loads(self.state.current())["mod"], False)
        self.press(e.KEY_LEFTMETA)
        line(self.state)
        self.assertEqual(json.loads(self.state.current())["mod"], True)


class Device:
    def __init__(self, fd, events):
        self.fd = fd
        self.path = "/dev/input/event{}".format(fd)
        self.events = events
        self.closed = False

    def read(self):
        return iter(self.events)

    def active_keys(self):
        return [e.KEY_LEFTMETA]

    def close(self):
        self.closed = True


class Event:
    def __init__(self, type, code, value=0):
        self.type = type
        self.code = code
        self.value = value


def report():
    return Event(e.EV_SYN, e.SYN_REPORT)


class ReaderTest(unittest.TestCase):
    def setUp(self):
        self.lines = []
        self.reader = keymods.Reader(
            lambda text: self.lines.append(json.loads(text))
        )

    def test_one_line_for_each_report(self):
        self.reader.devices[KANATA] = Device(
            KANATA,
            [
                Event(e.EV_KEY, e.KEY_LEFTMETA, 1),
                Event(e.EV_KEY, e.KEY_LEFTSHIFT, 1),
                report(),
                Event(e.EV_KEY, e.KEY_LEFTMETA, 0),
                report(),
            ],
        )
        self.reader.read(KANATA)
        self.assertEqual(
            [(s["mod"], s["shift"]) for s in self.lines],
            [(True, True), (False, False)],
        )

    def test_syn_dropped_skips_to_the_report_and_resyncs(self):
        self.reader.devices[KANATA] = Device(
            KANATA,
            [
                Event(e.EV_SYN, e.SYN_DROPPED),
                Event(e.EV_KEY, e.KEY_H, 1),
                report(),
            ],
        )
        self.reader.read(KANATA)
        self.assertEqual(len(self.lines), 1)
        self.assertEqual(self.lines[0]["mod"], True)
        self.assertEqual(self.lines[0]["held"], 0)

    def test_rescan_opens_keyboards_and_pointers_only(self):
        capabilities = {
            "/dev/input/event1": {e.EV_KEY: [e.KEY_A, e.KEY_LEFTMETA]},
            "/dev/input/event2": {e.EV_REL: [e.REL_X, e.REL_WHEEL]},
            "/dev/input/event3": {e.EV_SW: [e.SW_LID]},
        }
        opened = []

        class FakeDevice:
            def __init__(self, path):
                if path == "/dev/input/event4":
                    raise PermissionError(13, "Permission denied")
                self.path = path
                self.fd = int(path[-1])
                self.name = "fake"
                self.closed = False
                opened.append(path)

            def capabilities(self):
                return capabilities[self.path]

            def close(self):
                self.closed = True

        paths = sorted(capabilities) + ["/dev/input/event4"]
        with mock.patch.object(
            keymods.glob, "glob", lambda pattern: list(paths)
        ), mock.patch.object(keymods.evdev, "InputDevice", FakeDevice):
            self.reader.rescan()
            self.assertEqual(sorted(self.reader.devices), [1, 2])
            self.assertEqual(
                self.reader.ignored,
                {"/dev/input/event3", "/dev/input/event4"},
            )

            # A second scan opens nothing again.
            opened.clear()
            self.reader.rescan()
            self.assertEqual(opened, [])

            # A path that went away leaves the ignore list.
            paths.remove("/dev/input/event3")
            self.reader.rescan()
            self.assertEqual(self.reader.ignored, {"/dev/input/event4"})
        self.assertEqual(self.lines, [])

    def test_read_error_drops_the_device(self):
        class Gone(Device):
            def read(self):
                raise OSError(19, "No such device")

        self.reader.devices[MOUSE] = Device(MOUSE, [])
        self.reader.state.key(MOUSE, e.KEY_LEFTMETA, 1)
        self.reader.flush()
        gone = Gone(MOUSE, [])
        self.reader.devices[MOUSE] = gone
        self.reader.read(MOUSE)
        self.assertNotIn(MOUSE, self.reader.devices)
        self.assertTrue(gone.closed)
        self.assertEqual(self.lines[-1]["mod"], False)


if __name__ == "__main__":
    unittest.main()
