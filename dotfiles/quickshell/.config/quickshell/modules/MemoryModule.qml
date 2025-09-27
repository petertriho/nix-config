import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

BaseModule {
    id: root

    property real usedMemory: 0
    property real totalMemory: 0

    Timer {
        interval: 3000
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
                if (output) {
                    var lines = output.split('\n');
                    for (var i = 0; i < lines.length; i++) {
                        if (lines[i].startsWith('Mem:')) {
                            var parts = lines[i].split(/\s+/);
                            if (parts.length >= 3) {
                                var total = parseFloat(parts[1]);
                                var used = parseFloat(parts[2]);
                                totalMemory = total / 1024; // Convert to GB
                                usedMemory = used / 1024; // Convert to GB
                            }
                            break;
                        }
                    }
                }
            }
        }
    }

    function updateMemoryUsage() {
        memoryProcess.exec({
            command: ["free", "-m"]
        });
    }

    text: "󰾆 " + usedMemory.toFixed(1) + "G"
}
