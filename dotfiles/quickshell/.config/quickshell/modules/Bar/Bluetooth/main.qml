pragma ComponentBehavior: Bound

import QtQuick
// Aliased: the bar type `Bluetooth` (this file) shadows the module's `Bluetooth` singleton.
import Quickshell.Bluetooth as QsBluetooth
import ".."
import "../../Common"
import "." as Local

// Bluetooth state. A left click opens the Bluetooth popup, a middle click turns
// the adapter on or off, and a right click opens blueman-manager.
BaseModule {
    id: root

    readonly property var adapter: QsBluetooth.Bluetooth.defaultAdapter
    readonly property var devices: QsBluetooth.Bluetooth.devices.values
    readonly property var connectedDevices: root.devices.filter(device => device.connected)
    readonly property var pairedDevices: root.devices.filter(device => (device.paired || device.bonded) && !device.connected)
    // New devices that the adapter found. A device without a name shows only
    // its address, so it is left out.
    readonly property var availableDevices: root.devices.filter(device => !device.paired && !device.bonded && device.deviceName !== "")
    // Not `available`: that BaseModule property hides the module, and the
    // module stays visible without an adapter.
    readonly property bool adapterAvailable: !!root.adapter
    readonly property bool adapterEnabled: root.adapterAvailable && root.adapter.enabled
    readonly property string icon: !root.adapterEnabled ? "󰂲" : root.connectedDevices.length > 0 ? "󰂱" : "󰂯"

    // The Scan button of the popup sets this. Discovery runs only while the
    // popup is open, and a closed popup clears the request.
    property bool scanRequested: false
    readonly property bool scanning: root.popupOpen && root.adapterEnabled && root.scanRequested
    // Devices to trust and connect when their pairing completes, by address.
    property var pairTargets: ({})

    popupId: "bluetooth"
    settingsCommand: ["blueman-manager"]
    settingsLabel: "Open Bluetooth Settings"
    hoverEnabled: true
    hoverHighlight: true
    text: root.icon
    textColor: !root.adapterEnabled ? Config.colors.base03 : root.connectedDevices.length > 0 ? Config.colors.base0D : Config.colors.base05

    onPopupOpenChanged: {
        if (!root.popupOpen)
            root.scanRequested = false;
    }
    onScanningChanged: {
        if (root.adapterAvailable)
            root.adapter.discovering = root.scanning;
    }
    // A reload while the popup scans must not leave discovery on.
    Component.onDestruction: {
        if (root.scanning && root.adapterAvailable)
            root.adapter.discovering = false;
    }

    function toggleAdapter(): void {
        if (root.adapterAvailable)
            root.adapter.enabled = !root.adapter.enabled;
    }

    // A click on a device row: disconnect, connect, pair, or cancel the
    // pairing.
    function activate(device: var): void {
        if (device.pairing) {
            device.cancelPair();
            root.setPairTarget(device.address, false);
        } else if (device.connected) {
            device.disconnect();
        } else if (device.paired || device.bonded) {
            device.connect();
        } else {
            root.setPairTarget(device.address, true);
            device.pair();
        }
    }

    function setPairTarget(address: string, target: bool): void {
        const targets = Object.assign({}, root.pairTargets);
        if (target)
            targets[address] = true;
        else
            delete targets[address];
        root.pairTargets = targets;
    }

    // The ObjectModel, not `devices`: a change of that list would recreate
    // every connection.
    Instantiator {
        model: QsBluetooth.Bluetooth.devices

        delegate: Connections {
            id: deviceConnections
            required property var modelData
            target: deviceConnections.modelData

            function onPairedChanged(): void {
                const device = deviceConnections.modelData;
                if (!device.paired || !root.pairTargets[device.address])
                    return;
                root.setPairTarget(device.address, false);
                device.trusted = true;
                device.connect();
            }
        }
    }

    function displayName(device: var): string {
        if (!device)
            return "Unknown device";
        return device.name || device.deviceName || device.address;
    }

    // Glyph for the freedesktop icon name of a device.
    function deviceIcon(device: var): string {
        const icon = device.icon || "";
        if (icon.startsWith("audio-head"))
            return "󰋋";
        if (icon.startsWith("audio"))
            return "󰓃";
        if (icon === "input-mouse")
            return "󰍽";
        if (icon === "input-keyboard")
            return "󰌌";
        if (icon === "input-gaming")
            return "󰊴";
        if (icon.startsWith("phone"))
            return "󰏲";
        return "󰂯";
    }

    function statusText(device: var): string {
        if (device.state === QsBluetooth.BluetoothDeviceState.Connecting)
            return "Connecting…";
        if (device.state === QsBluetooth.BluetoothDeviceState.Disconnecting)
            return "Disconnecting…";
        if (device.connected)
            return device.batteryAvailable ? "Connected " + Math.round(device.battery * 100) + "%" : "Connected";
        if (device.pairing)
            return "Pairing…";
        if (device.paired || device.bonded)
            return "Paired";
        return "";
    }

    BarPopup {
        module: root
        preferredWidth: 320

        Local.Popup {
            module: root
        }
    }

    onMiddleClicked: root.toggleAdapter()
}
