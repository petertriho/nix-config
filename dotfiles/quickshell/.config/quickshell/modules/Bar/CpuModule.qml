import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

BaseModule {
    id: root

    property real cpuUsage: 0
    property QtObject config: parent.config

    Timer {
        interval: config ? config.intervals.cpu : 2000
        repeat: true
        running: true
        onTriggered: updateCpuUsage()
    }

    Component.onCompleted: updateCpuUsage()

    Process {
        id: cpuProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    var lines = output.split('\n');
                    for (var i = 0; i < lines.length; i++) {
                        if (lines[i].startsWith('cpu ')) {
                            var parts = lines[i].split(/\s+/);
                            if (parts.length >= 8) {
                                var idle = parseInt(parts[4]);
                                var total = 0;
                                for (var j = 1; j < 8; j++) {
                                    total += parseInt(parts[j]);
                                }
                                var usage = ((total - idle) / total) * 100;
                                cpuUsage = usage;
                                break;
                            }
                        }
                    }
                }
            }
        }
    }

    function updateCpuUsage() {
        cpuProcess.exec({
            command: ["grep", "cpu", "/proc/stat"]
        });
    }

    text: "󰍛 " + Math.round(cpuUsage) + "%"
}
