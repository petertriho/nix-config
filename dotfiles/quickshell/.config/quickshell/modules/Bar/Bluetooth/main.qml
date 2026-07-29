import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Bluetooth
import ".."
import "." as Local

BaseModule {
    id: root

    property var adapter: Bluetooth.defaultAdapter
    property var devices: Bluetooth.devices.values
    property var connectedDevices: devices.filter(function (device) {
        return device.connected;
    })
    property var pairedDevices: devices.filter(function (device) {
        return (device.paired || device.bonded) && !device.connected;
    })
    property bool available: adapter != null
    property bool enabled: available && adapter.enabled
    property bool showPopup: false
    readonly property real globalX: popupAnchor.globalX
    property var barWindow: null
    property bool inOverflow: false
    property var overflowAnchorModule: null
    property QtObject popupsConfig: parent.popupsConfig
    property QtObject overlayConfig: parent.overlayConfig
    property string icon: !available ? "󰂲" : !enabled ? "󰂲" : connectedDevices.length > 0 ? "󰂱" : "󰂯"

    hoverEnabled: true
    hoverHighlight: true
    text: icon
    textColor: !available || !enabled ? colors.base03 : connectedDevices.length > 0 ? colors.base0D : colors.base05

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

    onXChanged: popupAnchor.updatePosition()
    onWidthChanged: popupAnchor.updatePosition()
    Component.onCompleted: popupAnchor.updatePosition()

    onClicked: {
        popupAnchor.updatePosition();
        showPopup = !showPopup;
    }
}
