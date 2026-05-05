import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

BaseModule {
    id: root
    hoverEnabled: true

    property real cpuUsage: 0
    property var perCoreUsage: []
    property string loadAvg: ""
    property string processCount: ""
    property var prevCpuTimes: ({})
    property bool hasPrevData: false
    property bool showPopup: false
    property real globalX: 0
    property QtObject intervalsConfig: parent.intervalsConfig
    property QtObject thresholdsConfig: parent.thresholdsConfig

    Timer {
        interval: intervalsConfig.cpu
        repeat: true
        running: true
        onTriggered: updateCpu()
    }

    Component.onCompleted: { updateCpu(); updatePosition(); }

    Process {
        id: cpuProcess
        stdout: StdioCollector {
            onStreamFinished: parseCpuStats(text.trim())
        }
    }

    Process {
        id: loadProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var parts = text.trim().split(/\s+/);
                if (parts.length >= 3)
                    loadAvg = parts.slice(0, 3).join(" ");
                if (parts.length >= 5)
                    processCount = parts[3];
            }
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

    function parseCpuStats(output) {
        if (!output) return;
        var lines = output.split('\n');
        var newCores = [];
        var totalIdle = 0, totalAll = 0;

        for (var i = 0; i < lines.length; i++) {
            var parts = lines[i].trim().split(/\s+/);
            if (parts.length < 5) continue;
            var name = parts[0];

            if (name === 'cpu') {
                totalIdle = parseInt(parts[4]);
                for (var j = 1; j < parts.length; j++)
                    totalAll += parseInt(parts[j]);
            } else if (/^cpu\d+$/.test(name)) {
                var idle = parseInt(parts[4]), total = 0;
                for (var j = 1; j < parts.length; j++)
                    total += parseInt(parts[j]);

                var usage = 0;
                var prev = prevCpuTimes[name];
                if (prev && hasPrevData && total > prev.total) {
                    var dt = total - prev.total;
                    var di = idle - prev.idle;
                    usage = dt > 0 ? ((dt - di) / dt) * 100 : 0;
                }
                prevCpuTimes[name] = { total: total, idle: idle };
                newCores.push({ core: name.substring(3), usage: usage });
            }
        }

        perCoreUsage = newCores;

        if (hasPrevData) {
            var prev = prevCpuTimes['_total'];
            if (prev && totalAll > prev.total) {
                var dt = totalAll - prev.total;
                var di = totalIdle - prev.idle;
                cpuUsage = dt > 0 ? ((dt - di) / dt) * 100 : 0;
            }
        }
        prevCpuTimes['_total'] = { total: totalAll, idle: totalIdle };
        hasPrevData = true;
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

    function updateCpu() {
        cpuProcess.exec({ command: ["sh", "-c", "grep '^cpu' /proc/stat"] });
        loadProcess.exec({ command: ["cat", "/proc/loadavg"] });
    }

    text: "󰍛 " + Math.round(cpuUsage) + "%"

    onClicked: {
        Quickshell.execDetached({ command: ["alacritty", "-e", "btop"] });
    }

    onRightClicked: {
        Quickshell.execDetached({ command: ["ghostty", "-e", "btop"] });
    }
}
