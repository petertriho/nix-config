import QtQuick
import Quickshell
import Quickshell.Io
import "../Common"

// Screen backlight through brightnessctl. Every call names the backlight class:
// without it, brightnessctl falls back to the first device of any class (a
// keyboard LED on a desktop). The read at start detects the device once.
Item {
    id: root

    // True after the read at start found a backlight device. Without one, the
    // functions below do nothing.
    property bool available: false
    // Percent, 0 to 100.
    property real brightness: 0

    readonly property string icon: {
        if (root.brightness < Config.thresholds.brightness.low)
            return "󰃞";
        if (root.brightness < Config.thresholds.brightness.medium)
            return "󰃟";
        return "󰃠";
    }

    // Queued step applied to the next fresh reading, so presses never use a stale base.
    property int pendingDelta: 0
    property bool pendingAdjust: false

    // Machine-readable output: "device,class,current,percent,max".
    Process {
        id: readProcess
        command: ["brightnessctl", "--class=backlight", "--machine-readable", "info"]
        running: true
        stdout: StdioCollector {
            id: readOutput
            onStreamFinished: root.applyReading(readOutput.text)
        }
    }

    function applyReading(output) {
        const fields = output.trim().split(",");
        const current = parseInt(fields[2]);
        const max = parseInt(fields[4]);
        if (fields.length < 5 || isNaN(current) || isNaN(max) || max <= 0) {
            root.flushPendingFallback();
            return;
        }
        root.available = true;
        const fresh = Math.round(current / max * 100);
        root.brightness = fresh;
        if (!root.pendingAdjust)
            return;
        const adjusted = Math.max(0, Math.min(100, fresh + root.pendingDelta));
        root.pendingAdjust = false;
        root.pendingDelta = 0;
        if (adjusted !== fresh)
            root.setBrightness(adjusted);
    }

    // A read that is already running also applies a step queued meanwhile.
    function refresh() {
        if (root.available && !readProcess.running)
            readProcess.running = true;
    }

    function setBrightness(value) {
        const clamped = Math.max(0, Math.min(100, Math.round(value)));
        root.brightness = clamped;
        Quickshell.execDetached({
            command: ["brightnessctl", "--class=backlight", "set", clamped + "%"]
        });
    }

    // On re-read failure, apply the queued step to the cached value.
    function flushPendingFallback() {
        if (!root.pendingAdjust)
            return;
        const fallback = Math.max(0, Math.min(100, root.brightness + root.pendingDelta));
        root.pendingAdjust = false;
        root.pendingDelta = 0;
        if (fallback !== root.brightness)
            root.setBrightness(fallback);
    }

    // Changes the brightness by `delta` percent from a fresh reading.
    function adjust(delta) {
        if (!root.available)
            return;
        if (root.pendingAdjust) {
            root.pendingDelta += delta;
        } else {
            root.pendingAdjust = true;
            root.pendingDelta = delta;
            root.refresh();
        }
    }

    function increase(step) {
        root.adjust(step);
    }

    function decrease(step) {
        root.adjust(-step);
    }
}
