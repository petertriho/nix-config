"""Report held modifiers to the which-key overlay of Quickshell.

Wayland gives clients no global key state, so the overlay cannot see when
Mod is held. This reader opens every keyboard and pointer device without a
grab and serves the state as JSON lines on the socket that systemd passes in.

A line holds only modifier states and two counters, and the reader sends
lines only while Mod (Super) is held, plus one line when Mod is released.
So a client cannot rebuild typed text. Devices that kanata grabs give no
events here. Their keys come from the kanata virtual device instead.

Line fields:
  mod, ctrl, alt, shift  the modifier is held (left or right)
  held  non-modifier keys and mouse buttons that are down now
  seq   increases for each key press, mouse button press and scroll event
        while Mod is held

Run with --stdout to print the lines instead of serving the socket.
"""

import glob
import json
import os
import select
import socket
import sys
import time

import evdev
from evdev import ecodes

MODIFIERS = {
    ecodes.KEY_LEFTMETA: "mod",
    ecodes.KEY_RIGHTMETA: "mod",
    ecodes.KEY_LEFTCTRL: "ctrl",
    ecodes.KEY_RIGHTCTRL: "ctrl",
    ecodes.KEY_LEFTALT: "alt",
    ecodes.KEY_RIGHTALT: "alt",
    ecodes.KEY_LEFTSHIFT: "shift",
    ecodes.KEY_RIGHTSHIFT: "shift",
}

# Touchpad contacts (BTN_TOUCH, BTN_TOOL_*) and gamepad buttons are not
# chords. Only keys and mouse buttons are.
MOUSE_BUTTONS = range(ecodes.BTN_MOUSE, ecodes.BTN_TASK + 1)

WHEELS = {
    ecodes.REL_WHEEL,
    ecodes.REL_HWHEEL,
    ecodes.REL_WHEEL_HI_RES,
    ecodes.REL_HWHEEL_HI_RES,
}

RESCAN_SECONDS = 2.0

# systemd passes the first socket as this file descriptor.
SD_LISTEN_FDS_START = 3


def log(message):
    print("keymods: " + message, file=sys.stderr, flush=True)


def is_chord_key(code):
    if code in MODIFIERS:
        return False
    return (
        code < ecodes.BTN_MISC
        or code in MOUSE_BUTTONS
        or ecodes.KEY_OK <= code < ecodes.BTN_TRIGGER_HAPPY
    )


def is_tracked(code):
    return code in MODIFIERS or is_chord_key(code)


def encode(state):
    return json.dumps(state, separators=(",", ":")) + "\n"


class ModState:
    """Merge the keys that each device holds into one modifier state."""

    def __init__(self):
        # Device ID → codes that the device holds.
        self.pressed = {}
        self.seq = 0
        # The state that the clients have. No line goes out at start.
        self.sent = self.snapshot()

    def held(self, name):
        return any(
            MODIFIERS.get(code) == name
            for codes in self.pressed.values()
            for code in codes
        )

    def key(self, device, code, value):
        """Apply one EV_KEY event. Value 2 (autorepeat) changes nothing."""
        if value == 2 or not is_tracked(code):
            return
        codes = self.pressed.setdefault(device, set())
        if not value:
            codes.discard(code)
            return
        if code not in codes and is_chord_key(code) and self.held("mod"):
            self.seq += 1
        codes.add(code)

    def scroll(self, code):
        if code in WHEELS and self.held("mod"):
            self.seq += 1

    def resync(self, device, codes):
        """Set the keys that a device holds, after SYN_DROPPED."""
        self.pressed[device] = {code for code in codes if is_tracked(code)}

    def remove(self, device):
        self.pressed.pop(device, None)

    def snapshot(self):
        if not self.held("mod"):
            return {
                "mod": False,
                "ctrl": False,
                "alt": False,
                "shift": False,
                "held": 0,
                "seq": self.seq,
            }
        return {
            "mod": True,
            "ctrl": self.held("ctrl"),
            "alt": self.held("alt"),
            "shift": self.held("shift"),
            "held": sum(
                1
                for codes in self.pressed.values()
                for code in codes
                if is_chord_key(code)
            ),
            "seq": self.seq,
        }

    def flush(self):
        """Return the line to send, or None if the clients are up to date.

        While Mod is up, the snapshot does not change, so nothing goes out.
        """
        state = self.snapshot()
        if state == self.sent:
            return None
        self.sent = state
        return encode(state)

    def current(self):
        """Return the line for a new client."""
        return encode(self.sent)


def is_relevant(device):
    capabilities = device.capabilities()
    keys = capabilities.get(ecodes.EV_KEY, [])
    wheels = capabilities.get(ecodes.EV_REL, [])
    return (
        ecodes.KEY_LEFTMETA in keys
        or ecodes.BTN_LEFT in keys
        or ecodes.REL_WHEEL in wheels
    )


class Reader:
    """Read the devices and send each state change to `emit`."""

    def __init__(self, emit):
        self.state = ModState()
        self.emit = emit
        # File descriptor → open device.
        self.devices = {}
        # Paths of devices that are not keyboards or pointers, or that this
        # user cannot open.
        self.ignored = set()
        # Devices that wait for SYN_REPORT after SYN_DROPPED.
        self.dropped = set()

    def flush(self):
        line = self.state.flush()
        if line is not None:
            self.emit(line)

    def rescan(self):
        # Not evdev.list_devices(): it keeps only devices that this process
        # can also write, and the service may only read them.
        paths = set(glob.glob("/dev/input/event*"))
        self.ignored &= paths
        open_paths = {device.path for device in self.devices.values()}
        for path in sorted(paths - open_paths - self.ignored):
            try:
                device = evdev.InputDevice(path)
            except PermissionError:
                self.ignored.add(path)
                continue
            except OSError:
                # The device went away during the scan.
                continue
            if not is_relevant(device):
                device.close()
                self.ignored.add(path)
                continue
            # A new device starts with no keys held. active_keys() would also
            # report keys on a device that kanata grabs, and their releases
            # never come here, so those keys would stay held.
            self.devices[device.fd] = device
            log("reading {} ({})".format(path, device.name))

    def drop(self, fd):
        device = self.devices.pop(fd)
        self.dropped.discard(fd)
        self.state.remove(fd)
        log("lost {}".format(device.path))
        try:
            device.close()
        except OSError:
            pass
        self.flush()

    def read(self, fd):
        device = self.devices[fd]
        try:
            for event in device.read():
                self.handle(fd, event)
        except BlockingIOError:
            pass
        except OSError:
            self.drop(fd)

    def handle(self, fd, event):
        is_report = (
            event.type == ecodes.EV_SYN and event.code == ecodes.SYN_REPORT
        )
        if fd in self.dropped:
            # The kernel dropped events. Skip to the next report, then read
            # the key state of the device again. This device sends events,
            # so no other process grabs it.
            if is_report:
                self.dropped.discard(fd)
                self.state.resync(fd, self.devices[fd].active_keys())
                self.flush()
            return
        if event.type == ecodes.EV_KEY:
            self.state.key(fd, event.code, event.value)
        elif event.type == ecodes.EV_REL:
            self.state.scroll(event.code)
        elif is_report:
            self.flush()
        elif event.type == ecodes.EV_SYN and event.code == ecodes.SYN_DROPPED:
            self.dropped.add(fd)


class Server:
    """Send the state lines to every connected client."""

    def __init__(self, listener):
        self.listener = listener
        self.listener.setblocking(False)
        self.clients = set()

    def accept(self, line):
        try:
            client, _ = self.listener.accept()
        except BlockingIOError:
            return
        client.setblocking(False)
        if self.send(client, line):
            self.clients.add(client)

    def send(self, client, line):
        try:
            client.sendall(line.encode())
        except OSError:
            # The client went away or stopped reading.
            client.close()
            return False
        return True

    def broadcast(self, line):
        for client in list(self.clients):
            if not self.send(client, line):
                self.clients.discard(client)

    def receive(self, client):
        """Discard client input, and drop the client at end of file."""
        try:
            data = client.recv(4096)
        except BlockingIOError:
            return
        except OSError:
            data = b""
        if not data:
            self.clients.discard(client)
            client.close()


def systemd_listener():
    if os.environ.get("LISTEN_PID") != str(os.getpid()):
        return None
    if os.environ.get("LISTEN_FDS") != "1":
        return None
    return socket.socket(fileno=SD_LISTEN_FDS_START)


def run(reader, server):
    next_scan = 0.0
    while True:
        now = time.monotonic()
        if now >= next_scan:
            reader.rescan()
            next_scan = now + RESCAN_SECONDS
        watched = list(reader.devices)
        if server is not None:
            watched += [server.listener] + list(server.clients)
        timeout = max(0.0, next_scan - time.monotonic())
        ready, _, _ = select.select(watched, [], [], timeout)
        for item in ready:
            if isinstance(item, int):
                if item in reader.devices:
                    reader.read(item)
            elif item is server.listener:
                server.accept(reader.state.current())
            elif item in server.clients:
                server.receive(item)


def main(argv):
    if argv[1:] == ["--stdout"]:

        def emit(line):
            sys.stdout.write(line)
            sys.stdout.flush()

        run(Reader(emit), None)
        return 0

    listener = systemd_listener()
    if listener is None:
        log("start this from keymods.socket, or pass --stdout")
        return 2
    server = Server(listener)
    run(Reader(server.broadcast), server)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
