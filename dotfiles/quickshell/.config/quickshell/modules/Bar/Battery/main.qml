pragma ComponentBehavior: Bound

import QtQuick
import Quickshell.Services.UPower
import ".."
import "../../Common"
import "." as Local

BaseModule {
    id: root

    // batteries re-evaluates on UPower signals; refreshTick is a missed-signal safety net.
    readonly property var batteries: root.buildBatteries()
    readonly property bool hasBattery: root.batteries.length > 0
    readonly property bool hasWarning: root.batteries.some(b => b.isWarning)
    readonly property bool hasCritical: root.batteries.some(b => b.isCritical)

    available: root.hasBattery
    popupId: "battery"
    hoverHighlight: true
    text: root.batteries.length > 0 ? root.batteries.map(b => b.icon + " " + b.percentage + "%").join(" | ") : "󰁺 --%"
    textColor: root.hasCritical ? Config.colors.base08 : (root.hasWarning ? Config.colors.base0A : Config.colors.base05)

    property int refreshTick: 0

    Timer {
        interval: 300000
        repeat: true
        running: true
        onTriggered: root.refreshTick++
    }

    function formatSeconds(s: real): string {
        if (!s || s <= 0)
            return "";
        let h = Math.floor(s / 3600);
        let m = Math.round((s % 3600) / 60);
        if (m === 60) {
            h += 1;
            m = 0;
        }
        if (h > 0)
            return h + "h " + m + "m";
        return m + " min";
    }

    function buildBatteries(): var {
        // Register refreshTick as a binding dependency.
        root.refreshTick;
        const devs = UPower.devices && UPower.devices.values ? UPower.devices.values : [];
        const out = [];
        for (const d of devs) {
            if (!d || (d.type !== UPowerDeviceType.Battery && !d.isLaptopBattery))
                continue;
            if (d.isPresent === false)
                continue;

            // UPowerDevice.percentage is a 0-1 fraction. healthPercentage is 0-100.
            const pct = Math.round((Number(d.percentage) || 0) * 100);
            const isCharging = d.state === UPowerDeviceState.Charging;
            const isPlugged = isCharging || d.state === UPowerDeviceState.FullyCharged || d.state === UPowerDeviceState.PendingCharge;
            out.push({
                nativePath: d.nativePath || "",
                model: d.model || "",
                percentage: pct,
                stateLabel: UPowerDeviceState.toString(d.state),
                energy: d.energy || 0,
                energyCapacity: d.energyCapacity || 0,
                energyRate: Math.abs(d.changeRate || 0),
                health: d.healthSupported ? d.healthPercentage : 0,
                powerSupply: d.powerSupply ? "yes" : "no",
                timeToEmpty: root.formatSeconds(d.timeToEmpty),
                timeToFull: root.formatSeconds(d.timeToFull),
                isPlugged: isPlugged,
                icon: root.batteryIcon(pct, d.state),
                index: out.length,
                isWarning: pct <= Config.thresholds.battery.warning && !isCharging,
                isCritical: pct <= Config.thresholds.battery.critical && !isCharging
            });
        }
        return out;
    }

    // Label/value rows of the popup. Rows without a value are left out.
    function detailRows(battery: var): var {
        const rows = [];
        const add = (label, value, suffix) => {
            if (value)
                rows.push({
                    label: label,
                    value: value + suffix
                });
        };
        add("Native path", battery.nativePath, "");
        add("Model", battery.model, "");
        add("Energy", battery.energy ? battery.energy.toFixed(2) : "", " Wh");
        add("Full", battery.energyCapacity ? battery.energyCapacity.toFixed(2) : "", " Wh");
        add("Rate", battery.energyRate ? battery.energyRate.toFixed(2) : "", " W");
        add("Health", battery.health ? battery.health.toFixed(1) : "", "%");
        add("Power supply", battery.powerSupply, "");
        add("Time to empty", battery.timeToEmpty, "");
        add("Time to full", battery.timeToFull, "");
        return rows;
    }

    function batteryIcon(percentage: int, state: int): string {
        if (state === UPowerDeviceState.Charging)
            return "󰂄";
        if (state === UPowerDeviceState.FullyCharged || state === UPowerDeviceState.PendingCharge)
            return "󰚥";
        const icons = ["󰁺", "󰁻", "󰁼", "󰁽", "󰁾", "󰁿", "󰂀", "󰂁", "󰂂", "󰁹"];
        return icons[Math.max(0, Math.min(icons.length - 1, Math.floor(percentage / 10)))];
    }

    BarPopup {
        module: root
        preferredWidth: 360

        Local.Popup {
            module: root
        }
    }
}
