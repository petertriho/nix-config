import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

BaseModule {
    id: root
    hoverEnabled: true

    property real usedMemory: 0
    property real totalMemory: 0
    property real availableMemory: 0
    property real swapTotal: 0
    property real swapUsed: 0
    property var topMemoryApps: []
    property bool showPopup: false
    property real globalX: 0
    property QtObject intervalsConfig: parent.intervalsConfig
    property QtObject thresholdsConfig: parent.thresholdsConfig

    Timer {
        interval: intervalsConfig.memory
        repeat: true
        running: true
        onTriggered: updateMemoryUsage()
    }

    Component.onCompleted: { updateMemoryUsage(); updatePosition(); }

    Process {
        id: memoryProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (!output) return;
                var lines = output.split('\n');
                for (var i = 0; i < lines.length; i++) {
                    var parts = lines[i].split(/\s+/);
                    if (lines[i].startsWith('Mem:')) {
                        if (parts.length >= 7) {
                            totalMemory = parseFloat(parts[1]) / 1024;
                            usedMemory = parseFloat(parts[2]) / 1024;
                            availableMemory = parseFloat(parts[6]) / 1024;
                        }
                    } else if (lines[i].startsWith('Swap:')) {
                        if (parts.length >= 3) {
                            swapTotal = parseFloat(parts[1]) / 1024;
                            swapUsed = parseFloat(parts[2]) / 1024;
                        }
                    }
                }
            }
        }
    }

    Process {
        id: topMemoryProcess
        stdout: StdioCollector {
            onStreamFinished: parseTopMemoryApps(text.trim())
        }
    }

    Timer {
        id: showTimer
        interval: 150
        onTriggered: {
            root.updatePosition()
            root.showPopup = true
        }
    }

    Timer {
        id: dismissTimer
        interval: 150
        onTriggered: root.showPopup = false
    }

    onHoveredChanged: {
        if (root.hovered) {
            dismissTimer.stop()
            showTimer.restart()
        } else {
            showTimer.stop()
            dismissTimer.restart()
        }
    }

    function holdPopup() {
        dismissTimer.stop()
        showPopup = true
    }

    function releasePopup() {
        if (!root.hovered) {
            dismissTimer.restart()
        } else {
            dismissTimer.stop()
        }
    }

    function updatePosition() {
        var pos = root.mapToItem(null, 0, 0)
        root.globalX = pos.x
    }

    onXChanged: updatePosition()
    onWidthChanged: updatePosition()

    function parseTopMemoryApps(output) {
        if (!output) {
            topMemoryApps = [];
            return;
        }

        var apps = [];
        var lines = output.split('\n');
        for (var i = 0; i < lines.length && apps.length < 5; i++) {
            var line = lines[i].trim();
            if (!line) continue;

            var parts = line.split(/\s+/);
            if (parts.length < 2) continue;

            var rssMb = parseFloat(parts[parts.length - 1]) / 1024;
            if (isNaN(rssMb)) continue;
            apps.push({ name: parts.slice(0, parts.length - 1).join(" "), memoryMb: rssMb });
        }
        topMemoryApps = apps;
    }

    function updateMemoryUsage() {
        memoryProcess.exec({
            command: ["free", "-m"]
        });
        topMemoryProcess.exec({ command: ["sh", "-c", "ps -eo comm=,rss= | awk '{ rss=$NF; name=substr($0,1,length($0)-length($NF)); sub(/[[:space:]]+$/, \"\", name); usage[name] += rss } END { for (name in usage) printf \"%s\\t%.0f\\n\", name, usage[name] }' | sort -t '\t' -k2,2nr | head -n 5"] });
    }

    text: "󰾆 " + usedMemory.toFixed(1) + "G"
}
