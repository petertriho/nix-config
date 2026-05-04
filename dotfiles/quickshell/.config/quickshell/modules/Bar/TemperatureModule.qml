import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

BaseModule {
    id: root

    property real temperature: 0
    property bool isCritical: false
    property string tempPath: ""
    property QtObject intervalsConfig: parent.intervalsConfig
    property QtObject thresholdsConfig: parent.thresholdsConfig
    property var cpuTempDrivers: ["coretemp", "k10temp"]

    Timer {
        interval: intervalsConfig.temperature
        repeat: true
        running: true
        onTriggered: updateTemperature()
    }

    Component.onCompleted: findTempPath()

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
