import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

BaseModule {
    id: root
    hoverEnabled: true

    property real temperature: 0
    property bool isCritical: false
    property string tempPath: ""
    property bool showPopup: false
    property real globalX: 0
    property QtObject intervalsConfig: parent.intervalsConfig
    property QtObject thresholdsConfig: parent.thresholdsConfig
    property var cpuTempDrivers: ["coretemp", "k10temp"]

    Timer {
        interval: intervalsConfig.temperature
        repeat: true
        running: true
        onTriggered: updateTemperature()
    }

    Component.onCompleted: { findTempPath(); updatePosition(); }

    Process {
        id: findTempPathProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    tempPath = output;
                    updateTemperature();
                }
            }
        }
    }

    Process {
        id: tempProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    var temp = parseInt(output);
                    temperature = temp / 1000;
                    isCritical = temperature >= thresholdsConfig.temperature.critical;
                }
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

    function findTempPath() {
        var pattern = cpuTempDrivers.join("|");
        var cmd = "for hwmon in /sys/class/hwmon/hwmon*; do ";
        cmd += "name=$(cat \"$hwmon/name\" 2>/dev/null); ";
        cmd += "if echo \"$name\" | grep -qE '^(" + pattern + ")$' && ";
        cmd += "[ -f \"$hwmon/temp1_input\" ]; then ";
        cmd += "echo \"$hwmon/temp1_input\"; break; fi; done";
        findTempPathProcess.exec({ command: ["bash", "-c", cmd] });
    }

    function updateTemperature() {
        if (tempPath) {
            tempProcess.exec({
                command: ["cat", tempPath]
            });
        } else {
            findTempPath();
        }
    }

    text: {
        var icon = isCritical ? "󰸁" : (temperature > 60 ? "󱃃" : "󰜗");
        return icon + " " + Math.round(temperature) + "°C";
    }

    textColor: isCritical ? colors.red : colors.fg
}
