import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Bluetooth

BaseModule {
    id: root

    property var adapter: Bluetooth.defaultAdapter
    property var devices: Bluetooth.devices.values
    property var connectedDevices: devices.filter(function(device) { return device.connected; })
    property var pairedDevices: devices.filter(function(device) { return (device.paired || device.bonded) && !device.connected; })
    property bool available: adapter != null
    property bool enabled: available && adapter.enabled
    property bool showPopup: false
    property real globalX: 0
    property QtObject popupsConfig: parent.popupsConfig
    property string icon: !available ? "󰂲" : !enabled ? "󰂲" : connectedDevices.length > 0 ? "󰂱" : "󰂯"

    hoverEnabled: true
    text: icon
    textColor: !available || !enabled ? colors.comment : connectedDevices.length > 0 ? colors.blue : colors.fg

    function updatePosition() {
        var pos = root.mapToItem(null, 0, 0)
        root.globalX = pos.x
    }

    function displayName(device) {
        if (!device)
            return "Unknown device";
        if (device.name)
            return device.name;
        if (device.deviceName)
            return device.deviceName;
        return device.address;
    }

    function statusText(device) {
        if (device.connected)
            return device.batteryAvailable ? "Connected " + Math.round(device.battery * 100) + "%" : "Connected";
        if (device.pairing)
            return "Pairing";
        if (device.paired || device.bonded)
            return "Paired";
        return "Known";
    }

    function adapterText() {
        if (!available)
            return "No adapter";
        return (adapter.name || adapter.adapterId || "Bluetooth") + (enabled ? " on" : " off");
    }

    onXChanged: updatePosition()
    onWidthChanged: updatePosition()
    Component.onCompleted: updatePosition()

    onClicked: {
        updatePosition()
        showPopup = !showPopup
    }
}
