pragma ComponentBehavior: Bound

import QtQuick
// Aliased: the bar type `Bluetooth` (this file) shadows the module's `Bluetooth` singleton.
import Quickshell.Bluetooth as QsBluetooth
import ".."
import "../../Common"
import "." as Local

BaseModule {
    id: root

    readonly property var adapter: QsBluetooth.Bluetooth.defaultAdapter
    readonly property var devices: QsBluetooth.Bluetooth.devices.values
    readonly property var connectedDevices: root.devices.filter(device => device.connected)
    readonly property var pairedDevices: root.devices.filter(device => (device.paired || device.bonded) && !device.connected)
    // Not `available`: that BaseModule property hides the module, and the
    // module stays visible without an adapter.
    readonly property bool adapterAvailable: !!root.adapter
    readonly property bool adapterEnabled: root.adapterAvailable && root.adapter.enabled
    readonly property string icon: !root.adapterEnabled ? "󰂲" : root.connectedDevices.length > 0 ? "󰂱" : "󰂯"

    popupId: "bluetooth"
    settingsCommand: ["blueman-manager"]
    settingsLabel: "Open Bluetooth Settings"
    hoverEnabled: true
    hoverHighlight: true
    text: root.icon
    textColor: !root.adapterEnabled ? Config.colors.base03 : root.connectedDevices.length > 0 ? Config.colors.base0D : Config.colors.base05

    function displayName(device: var): string {
        if (!device)
            return "Unknown device";
        return device.name || device.deviceName || device.address;
    }

    function statusText(device: var): string {
        if (device.connected)
            return device.batteryAvailable ? "Connected " + Math.round(device.battery * 100) + "%" : "Connected";
        if (device.pairing)
            return "Pairing";
        if (device.paired || device.bonded)
            return "Paired";
        return "Known";
    }

    function adapterText(): string {
        if (!root.adapterAvailable)
            return "No adapter";
        return (root.adapter.name || root.adapter.adapterId || "Bluetooth") + (root.adapterEnabled ? " on" : " off");
    }

    BarPopup {
        module: root
        preferredWidth: 320

        Local.Popup {
            module: root
        }
    }
}
