pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "../Common"
import "whichKeyHelpers.js" as WhichKeyHelpers

// State of the which-key overlay. The keymods system service reports the
// held modifiers (pkgs/keymods/keymods.py). The overlay shows while Mod is
// held, no other key or mouse button is down, and none was pressed in the
// last `whichKey.delayMs`. A change of Ctrl, Alt or Shift switches the layer
// at once and does not hide the overlay.
Singleton {
    id: root

    property bool modHeld: false
    property bool ctrlHeld: false
    property bool altHeld: false
    property bool shiftHeld: false
    // Non-modifier keys and mouse buttons that are down now.
    property int heldCount: 0
    // Increases for each key press, button press and scroll while Mod is held.
    property int chordSeq: 0
    // True when the show timer ran out after the last Mod press or chord.
    property bool idle: false
    // A layer that preview() shows without held keys, or "".
    property string previewLayer: ""
    // The parsed bind file: { layers, groups, counts } (see whichKeyHelpers.js).
    property var view: WhichKeyHelpers.parseBindFile(null)
    property string bindsText: ""
    property bool disconnectLogged: false

    readonly property string layerName: root.previewLayer !== "" ? root.previewLayer : WhichKeyHelpers.layerName({
        mod: root.modHeld,
        ctrl: root.ctrlHeld,
        alt: root.altHeld,
        shift: root.shiftHeld
    })
    // The modifier rows, then the key rows.
    readonly property var rows: WhichKeyHelpers.viewRows(root.view, root.layerName)
    readonly property bool shown: root.previewLayer !== "" || (root.modHeld && root.heldCount === 0 && root.idle)

    // Written by home/programs/niri.nix.
    readonly property string bindsPath: (Quickshell.env("XDG_CONFIG_HOME") || Quickshell.env("HOME") + "/.config") + "/niri/which-key-binds.json"

    // Shows a layer, for example "Mod+Shift", until hide() or the next Mod
    // release. Returns the canonical name, or an error.
    function preview(layer: string): string {
        const name = WhichKeyHelpers.canonicalLayer(layer);
        if (name === "")
            return "Not a layer: \"" + layer + "\". Use a name such as Mod+Shift.";
        bindsFile.reload();
        root.previewLayer = name;
        return name;
    }

    function hide(): void {
        root.previewLayer = "";
    }

    function reset(): void {
        root.modHeld = false;
        root.ctrlHeld = false;
        root.altHeld = false;
        root.shiftHeld = false;
        root.heldCount = 0;
        root.idle = false;
        showTimer.stop();
    }

    function handleLine(line: string): void {
        let state;
        try {
            state = JSON.parse(line);
        } catch (e) {
            console.warn("WhichKeyService: bad line from keymods:", e);
            return;
        }

        const wasHeld = root.modHeld;
        const chord = state.seq !== root.chordSeq;
        const keysReleased = root.heldCount > 0 && state.held === 0;
        root.modHeld = state.mod === true;
        root.ctrlHeld = state.ctrl === true;
        root.altHeld = state.alt === true;
        root.shiftHeld = state.shift === true;
        root.heldCount = Number(state.held) || 0;
        root.chordSeq = Number(state.seq) || 0;

        if (!root.modHeld) {
            if (wasHeld)
                root.previewLayer = "";
            root.idle = false;
            showTimer.stop();
        } else if (root.heldCount > 0) {
            root.idle = false;
            showTimer.stop();
        } else if (!wasHeld || chord || keysReleased) {
            if (!wasHeld)
                bindsFile.reload();
            root.idle = false;
            showTimer.restart();
        }
    }

    function loadBinds(text: string): void {
        // Each Mod press reads the file. Most reads find the same text.
        if (text === root.bindsText)
            return;
        root.bindsText = text;
        try {
            root.view = WhichKeyHelpers.parseBindFile(JSON.parse(text));
        } catch (e) {
            console.warn("WhichKeyService: bad bind file", root.bindsPath, e);
            root.view = WhichKeyHelpers.parseBindFile(null);
        }
    }

    Timer {
        id: showTimer
        interval: Config.whichKey.delayMs
        onTriggered: root.idle = true
    }

    Timer {
        id: reconnectTimer
        interval: Config.whichKey.reconnectMs
        onTriggered: {
            reconnectTimer.interval = Math.min(reconnectTimer.interval * 2, Config.whichKey.reconnectMaxMs);
            socket.connected = true;
        }
    }

    Socket {
        id: socket
        path: Config.whichKey.socketPath
        connected: true

        parser: SplitParser {
            onRead: data => root.handleLine(data)
        }

        onConnectionStateChanged: {
            if (socket.connected) {
                reconnectTimer.interval = Config.whichKey.reconnectMs;
                if (root.disconnectLogged)
                    console.info("WhichKeyService: connected to", socket.path);
                root.disconnectLogged = false;
            } else {
                root.reset();
                reconnectTimer.start();
            }
        }

        // A failed connection emits only this signal. Quickshell logs each
        // error itself, so this logs once until the next connection.
        onError: error => {
            if (!root.disconnectLogged)
                console.warn("WhichKeyService: no connection to", socket.path, "- is keymods.socket running? Error:", error);
            root.disconnectLogged = true;
            root.reset();
            reconnectTimer.start();
        }
    }

    // Home Manager replaces the symlink of this file, and a file watch
    // follows the old target. So each Mod press reads the file again.
    FileView {
        id: bindsFile
        path: root.bindsPath
        printErrors: false
        onLoaded: root.loadBinds(bindsFile.text())
        onLoadFailed: error => {
            console.warn("WhichKeyService: cannot read", root.bindsPath, FileViewError.toString(error));
            root.bindsText = "";
            root.view = WhichKeyHelpers.parseBindFile(null);
        }
    }
}
