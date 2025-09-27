import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import ".."

BaseModule {
    id: root

    property real capacity: 0
    property bool isCharging: false
    property bool isPlugged: false
    property bool isWarning: false
    property bool isCritical: false
    property string icon: "󰁺"

    Timer {
        interval: 5000
        repeat: true
        running: true
        onTriggered: updateBattery()
    }

    Component.onCompleted: updateBattery()

    Process {
        id: batteryProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    parseBatteryInfo(output);
                }
            }
        }
    }

    function updateBattery() {
        batteryProcess.exec({
            command: ["upower", "-i", "/org/freedesktop/UPower/devices/battery_BAT0"]
        });
    }

    function parseBatteryInfo(output) {
        var lines = output.split('\n');
        capacity = 0;
        isCharging = false;
        isPlugged = false;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.startsWith('percentage:')) {
                var match = line.match(/(\d+)%/);
                if (match) {
                    capacity = parseInt(match[1]);
                }
            } else if (line.startsWith('state:')) {
                var state = line.split(':')[1].trim();
                isCharging = (state === 'charging');
                isPlugged = (state === 'charging' || state === 'fully-charged');
            }
        }

        isWarning = capacity <= 30 && !isCharging;
        isCritical = capacity <= 15 && !isCharging;
        updateIcon();
    }

    function updateIcon() {
        var iconIndex = Math.floor((capacity / 100) * 10);
        if (iconIndex < 0)
            iconIndex = 0;
        if (iconIndex > 10)
            iconIndex = 10;

        var icons = ["󰁺", "󰁻", "󰁼", "󰁽", "󰁾", "󰁿", "󰂀", "󰂁", "󰂂", "󰁹"];
        icon = icons[iconIndex];

        if (isCharging) {
            icon = "󰂄 " + icon;
        } else if (isPlugged) {
            icon = "󰚥 " + icon;
        }
    }

    text: {
        if (isCharging) {
            return "󰂄 " + capacity + "%";
        } else if (isPlugged) {
            return "󰚥 " + capacity + "%";
        } else {
            return icon + " " + capacity + "%";
        }
    }

    textColor: isCritical ? Colors.colors.red : Colors.colors.fg
}
