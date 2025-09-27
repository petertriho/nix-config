import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import ".."

BaseModule {
    id: root

    property real temperature: 0
    property bool isCritical: false
    property string tempPath: ""

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

    Timer {
        interval: 5000
        repeat: true
        running: true
        onTriggered: updateTemperature()
    }

    Component.onCompleted: findTempPath()

    Process {
        id: tempProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    var temp = parseInt(output);
                    temperature = temp / 1000; // Convert from millidegrees
                    isCritical = temperature >= 80;
                }
            }
        }
    }

    function findTempPath() {
        findTempPathProcess.exec({
            command: ["bash", "-c", "for hwmon in /sys/class/hwmon/hwmon*; do if [ -f \"$hwmon/name\" ] && grep -q \"coretemp\" \"$hwmon/name\" && [ -f \"$hwmon/temp1_input\" ]; then echo \"$hwmon/temp1_input\" && break; fi; done"]
        });
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

    textColor: isCritical ? Colors.colors.red : Colors.colors.fg
}
