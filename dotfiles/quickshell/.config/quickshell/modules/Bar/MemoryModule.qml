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
    property bool showPopup: false
    property QtObject intervalsConfig: parent.intervalsConfig
    property QtObject thresholdsConfig: parent.thresholdsConfig

    Timer {
        interval: intervalsConfig.memory
        repeat: true
        running: true
        onTriggered: updateMemoryUsage()
    }

    Component.onCompleted: updateMemoryUsage()

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

    Timer {
        id: showTimer
        interval: 400
        onTriggered: root.showPopup = true
    }

    Timer {
        id: dismissTimer
        interval: 600
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

    function updateMemoryUsage() {
        memoryProcess.exec({
            command: ["free", "-m"]
        });
    }

    text: "󰾆 " + usedMemory.toFixed(1) + "G"
}
