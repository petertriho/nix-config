import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

BaseModule {
    id: root

    property string connectionType: "disconnected"
    property string essid: ""
    property real signalStrength: 0
    property string ipaddr: ""
    property string icon: "󰌙"
    property QtObject config: parent.config

    Timer {
        interval: config ? config.intervals.network : 5000
        repeat: true
        running: true
        onTriggered: updateNetwork()
    }

    Component.onCompleted: updateNetwork()

    Process {
        id: networkProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    parseNetworkInfo(output);
                }
            }
        }
    }

    function updateNetwork() {
        networkProcess.exec({
            command: ["nmcli", "-g", "IN-USE,SIGNAL,SSID", "dev", "wifi", "list"]
        });
    }

    function parseNetworkInfo(output) {
        var lines = output.split('\n');
        connectionType = "disconnected";
        essid = "";
        signalStrength = 0;
        ipaddr = "";

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line) {
                var parts = line.split(':');
                if (parts.length >= 3) {
                    var inUse = parts[0].trim();
                    var signal = parts[1].trim();
                    var ssid = parts[2].trim();

                    if (inUse === '*') {
                        connectionType = "wifi";
                        essid = ssid;
                        signalStrength = parseInt(signal);
                        break;
                    }
                }
            }
        }

        updateIcon();
    }

    function updateIcon() {
        if (connectionType === "disconnected") {
            icon = "󰌙";
        } else if (connectionType === "ethernet") {
            icon = "󰈀";
        } else if (connectionType === "wifi") {
            var signalIndex = Math.floor((signalStrength / 100) * 4);
            if (signalIndex < 0)
                signalIndex = 0;
            if (signalIndex > 4)
                signalIndex = 4;

            var wifiIcons = ["󰤯", "󰤟", "󰤢", "󰤥", "󰤨"];
            icon = wifiIcons[signalIndex];
        } else {
            icon = "󰌷";
        }
    }

    text: icon
}
