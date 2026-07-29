import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import ".."
import "." as Local

BaseModule {
    id: root

    property var batteries: []
    property bool hasBattery: false
    property bool hasWarning: false
    property bool hasCritical: false
    property string batteryText: "󰁺 --%"
    property bool showPopup: false
    readonly property real globalX: popupAnchor.globalX
    property var barWindow: null
    property bool inOverflow: false
    property var overflowAnchorModule: null
    property QtObject intervalsConfig: parent.intervalsConfig
    property QtObject thresholdsConfig: parent.thresholdsConfig
    property QtObject popupsConfig: parent.popupsConfig
    property QtObject overlayConfig: parent.overlayConfig

    hoverHighlight: true

    Timer {
        interval: intervalsConfig.battery
        repeat: true
        running: true
        onTriggered: updateBattery()
    }

    Component.onCompleted: {
        updateBattery();
        popupAnchor.updatePosition();
    }

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
        hasBattery = devices.length > 0;

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
            nativePath: "",
            vendor: "",
            model: "",
            serial: "",
            percentage: 0,
            state: 'unknown',
            energy: 0,
            energyFull: 0,
            energyFullDesign: 0,
            energyRate: 0,
            voltage: 0,
            capacity: 0,
            chargeCycles: "",
            technology: "",
            capacityLevel: "",
            voltageMinDesign: 0,
            chargeStartThreshold: "",
            chargeEndThreshold: "",
            chargeThresholdSupported: "",
            updated: "",
            powerSupply: "",
            present: "",
            rechargeable: "",
            timeToEmpty: "",
            timeToFull: ""
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
            } else if (line.startsWith('energy-full-design:')) {
                var designMatch = line.match(/([\d.]+)\s*Wh/);
                if (designMatch) {
                    batteryData.energyFullDesign = parseFloat(designMatch[1]);
                }
            } else if (line.startsWith('energy-full:')) {
                var energyFullMatch = line.match(/([\d.]+)\s*Wh/);
                if (energyFullMatch) {
                    batteryData.energyFull = parseFloat(energyFullMatch[1]);
                }
            } else if (line.startsWith('native-path:')) {
                batteryData.nativePath = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('vendor:')) {
                batteryData.vendor = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('model:')) {
                batteryData.model = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('serial:')) {
                batteryData.serial = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('energy-rate:')) {
                var rateMatch = line.match(/([\d.]+)\s*W/);
                if (rateMatch) {
                    batteryData.energyRate = parseFloat(rateMatch[1]);
                }
            } else if (line.startsWith('voltage:')) {
                var voltageMatch = line.match(/([\d.]+)\s*V/);
                if (voltageMatch) {
                    batteryData.voltage = parseFloat(voltageMatch[1]);
                }
            } else if (line.startsWith('capacity:')) {
                var capacityMatch = line.match(/([\d.]+)%/);
                if (capacityMatch) {
                    batteryData.capacity = parseFloat(capacityMatch[1]);
                }
            } else if (line.startsWith('time to empty:')) {
                batteryData.timeToEmpty = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('time to full:')) {
                batteryData.timeToFull = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('charge-cycles:')) {
                batteryData.chargeCycles = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('technology:')) {
                batteryData.technology = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('capacity-level:')) {
                batteryData.capacityLevel = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('voltage-min-design:')) {
                var minVoltageMatch = line.match(/([\d.]+)\s*V/);
                if (minVoltageMatch) {
                    batteryData.voltageMinDesign = parseFloat(minVoltageMatch[1]);
                }
            } else if (line.startsWith('charge-start-threshold:')) {
                batteryData.chargeStartThreshold = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('charge-end-threshold:')) {
                batteryData.chargeEndThreshold = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('charge-threshold-supported:')) {
                batteryData.chargeThresholdSupported = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('updated:')) {
                batteryData.updated = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('power supply:')) {
                batteryData.powerSupply = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('present:')) {
                batteryData.present = line.split(':').slice(1).join(':').trim();
            } else if (line.startsWith('rechargeable:')) {
                batteryData.rechargeable = line.split(':').slice(1).join(':').trim();
            }
        }

        batteryDataQueue.push(batteryData);
        currentBatteryIndex++;
        fetchNextBattery();
    }

    function aggregateBatteryData() {
        if (batteryDataQueue.length === 0)
            return;

        var updatedBatteries = [];
        hasWarning = false;
        hasCritical = false;

        for (var i = 0; i < batteryDataQueue.length; i++) {
            var batteryData = batteryDataQueue[i];

            var battery = {
                nativePath: batteryData.nativePath,
                vendor: batteryData.vendor,
                model: batteryData.model,
                serial: batteryData.serial,
                percentage: batteryData.percentage,
                state: batteryData.state,
                energy: batteryData.energy,
                energyFull: batteryData.energyFull,
                energyFullDesign: batteryData.energyFullDesign,
                energyRate: batteryData.energyRate,
                voltage: batteryData.voltage,
                capacity: batteryData.capacity,
                chargeCycles: batteryData.chargeCycles,
                technology: batteryData.technology,
                capacityLevel: batteryData.capacityLevel,
                voltageMinDesign: batteryData.voltageMinDesign,
                chargeStartThreshold: batteryData.chargeStartThreshold,
                chargeEndThreshold: batteryData.chargeEndThreshold,
                chargeThresholdSupported: batteryData.chargeThresholdSupported,
                updated: batteryData.updated,
                powerSupply: batteryData.powerSupply,
                present: batteryData.present,
                rechargeable: batteryData.rechargeable,
                timeToEmpty: batteryData.timeToEmpty,
                timeToFull: batteryData.timeToFull,
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

            updatedBatteries.push(battery);
        }
        batteries = updatedBatteries;
        updateBatteryText();
    }

    function addDetailRow(rows, label, value, suffix) {
        if (value === undefined || value === null || value === "" || value === 0)
            return;
        rows.push({
            label: label,
            value: suffix ? value + suffix : String(value)
        });
    }

    function detailRows(battery) {
        var rows = [];
        addDetailRow(rows, "Native path", battery.nativePath, "");
        addDetailRow(rows, "Vendor", battery.vendor, "");
        addDetailRow(rows, "Model", battery.model, "");
        addDetailRow(rows, "Serial", battery.serial, "");
        addDetailRow(rows, "Energy", battery.energy ? battery.energy.toFixed(2) : 0, " Wh");
        addDetailRow(rows, "Full", battery.energyFull ? battery.energyFull.toFixed(2) : 0, " Wh");
        addDetailRow(rows, "Design", battery.energyFullDesign ? battery.energyFullDesign.toFixed(2) : 0, " Wh");
        addDetailRow(rows, "Rate", battery.energyRate ? battery.energyRate.toFixed(2) : 0, " W");
        addDetailRow(rows, "Voltage", battery.voltage ? battery.voltage.toFixed(2) : 0, " V");
        addDetailRow(rows, "Capacity", battery.capacity ? battery.capacity.toFixed(1) : 0, "%");
        addDetailRow(rows, "Capacity level", battery.capacityLevel, "");
        addDetailRow(rows, "Cycles", battery.chargeCycles, "");
        addDetailRow(rows, "Technology", battery.technology, "");
        addDetailRow(rows, "Min design voltage", battery.voltageMinDesign ? battery.voltageMinDesign.toFixed(2) : 0, " V");
        addDetailRow(rows, "Charge start", battery.chargeStartThreshold, "");
        addDetailRow(rows, "Charge end", battery.chargeEndThreshold, "");
        addDetailRow(rows, "Threshold support", battery.chargeThresholdSupported, "");
        addDetailRow(rows, "Updated", battery.updated, "");
        addDetailRow(rows, "Power supply", battery.powerSupply, "");
        addDetailRow(rows, "Present", battery.present, "");
        addDetailRow(rows, "Rechargeable", battery.rechargeable, "");
        addDetailRow(rows, "Time to empty", battery.timeToEmpty, "");
        addDetailRow(rows, "Time to full", battery.timeToFull, "");
        return rows;
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

    function popupX(popupWidth) {
        return popupAnchor.popupX(popupWidth);
    }

    function closePopup() {
        root.showPopup = false;
    }

    Local.Popup {
        module: root
        barWindow: root.barWindow
        colors: root.colors
        fontsConfig: root.fontsConfig
        popupsConfig: root.popupsConfig
        overlayConfig: root.overlayConfig
    }

    PopupAnchor {
        id: popupAnchor
        module: root
        barWindow: root.barWindow
        inOverflow: root.inOverflow
        overflowAnchorModule: root.overflowAnchorModule
    }

    onClicked: {
        popupAnchor.updatePosition();
        showPopup = !showPopup;
    }

    onXChanged: popupAnchor.updatePosition()
    onWidthChanged: popupAnchor.updatePosition()

    visible: hasBattery

    text: batteryText

    textColor: hasCritical ? colors.base08 : (hasWarning ? colors.base0A : colors.base05)
}
