import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

BaseModule {
    id: root

    property var batteries: []
    property bool hasWarning: false
    property bool hasCritical: false
    property string batteryText: "󰁺 --%"
    property QtObject intervalsConfig: parent.intervalsConfig
    property QtObject thresholdsConfig: parent.thresholdsConfig

    Timer {
        interval: intervalsConfig.battery
        repeat: true
        running: true
        onTriggered: updateBattery()
    }

    Component.onCompleted: updateBattery()

    Process {
        id: batteryListProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    var lines = output.split('\n');
                    var batteryDevices = [];
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i].trim();
                        if (line.indexOf('battery_') !== -1) {
                            batteryDevices.push(line);
                        }
                    }
                    fetchBatteryData(batteryDevices);
                }
            }
        }
    }

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

    property var batteryDataQueue: []
    property var batteryDevices: []
    property int currentBatteryIndex: 0

    function updateBattery() {
        batteryListProcess.exec({
            command: ["upower", "-e"]
        });
    }

    function fetchBatteryData(devices) {
        batteryDevices = devices;
        batteryDataQueue = [];
        currentBatteryIndex = 0;

        if (devices.length === 0) {
            batteries = [];
            return;
        }

        fetchNextBattery();
    }

    function fetchNextBattery() {
        if (currentBatteryIndex >= batteryDevices.length) {
            aggregateBatteryData();
            return;
        }

        batteryProcess.exec({
            command: ["upower", "-i", batteryDevices[currentBatteryIndex]]
        });
    }

    function parseBatteryInfo(output) {
        var lines = output.split('\n');
        var batteryData = {
            percentage: 0,
            state: 'unknown',
            energy: 0,
            energyFull: 0
        };

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.startsWith('percentage:')) {
                var match = line.match(/(\d+)%/);
                if (match) {
                    batteryData.percentage = parseInt(match[1]);
                }
            } else if (line.startsWith('state:')) {
                batteryData.state = line.split(':')[1].trim();
            } else if (line.startsWith('energy:') && !line.includes('energy-empty') && !line.includes('energy-full')) {
                var energyMatch = line.match(/([\d.]+)\s*Wh/);
                if (energyMatch) {
                    batteryData.energy = parseFloat(energyMatch[1]);
                }
            } else if (line.startsWith('energy-full:')) {
                var energyFullMatch = line.match(/([\d.]+)\s*Wh/);
                if (energyFullMatch) {
                    batteryData.energyFull = parseFloat(energyFullMatch[1]);
                }
            }
        }

        batteryDataQueue.push(batteryData);
        currentBatteryIndex++;
        fetchNextBattery();
    }

    function aggregateBatteryData() {
        if (batteryDataQueue.length === 0)
            return;

        batteries = [];
        hasWarning = false;
        hasCritical = false;

        for (var i = 0; i < batteryDataQueue.length; i++) {
            var batteryData = batteryDataQueue[i];

            var battery = {
                percentage: batteryData.percentage,
                isCharging: batteryData.state === 'charging',
                isPlugged: batteryData.state === 'charging' || batteryData.state === 'fully-charged' || batteryData.state === 'pending-charge',
                icon: getBatteryIcon(batteryData.percentage, batteryData.state),
                index: i
            };

            battery.isWarning = battery.percentage <= thresholdsConfig.battery.warning && !battery.isCharging;
            battery.isCritical = battery.percentage <= thresholdsConfig.battery.critical && !battery.isCharging;

            if (battery.isWarning)
                hasWarning = true;
            if (battery.isCritical)
                hasCritical = true;

            batteries.push(battery);
        }
        updateBatteryText();
    }

    function updateBatteryText() {
        if (!batteries || batteries.length === 0) {
            batteryText = "󰁺 --%";
            return;
        }

        var parts = [];
        for (var i = 0; i < batteries.length; i++) {
            var battery = batteries[i];
            var text = battery.icon + " " + battery.percentage + "%";
            parts.push(text);
        }
        batteryText = parts.join(" | ");
    }

    function getBatteryIcon(percentage, state) {
        var iconIndex = Math.floor((percentage / 100) * 10);
        if (iconIndex < 0)
            iconIndex = 0;
        if (iconIndex > 10)
            iconIndex = 10;

        var icons = ["󰁺", "󰁻", "󰁼", "󰁽", "󰁾", "󰁿", "󰂀", "󰂁", "󰂂", "󰁹"];
        var icon = icons[iconIndex];

        if (state === 'charging') {
            icon = "󰂄";
        } else if (state === 'fully-charged' || state === 'pending-charge') {
            icon = "󰚥";
        }

        return icon;
    }

    text: batteryText

    textColor: hasCritical ? colors.red : (hasWarning ? colors.yellow : colors.fg)
}
