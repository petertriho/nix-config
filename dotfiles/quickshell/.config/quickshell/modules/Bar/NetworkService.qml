pragma Singleton
pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Networking
import "../Common"

// Network state for every bar. The bindings read notifying properties of the
// Networking objects, so they update without polling or a per-bar scan.
Singleton {
    id: root

    // False when Quickshell found no network backend at start (NetworkManager
    // was not on the bus yet). A reload does not retry, only a restart does.
    readonly property bool backendAvailable: Networking.backend !== NetworkBackendType.None

    readonly property var wifiDevice: Networking.devices.values.find(device => device.type === DeviceType.Wifi) || null
    // The wired device with a link, else the first wired device, or null.
    readonly property var wiredDevice: {
        const wired = Networking.devices.values.filter(device => device.type === DeviceType.Wired);
        return wired.find(device => device.connected || device.hasLink) || wired[0] || null;
    }

    // Quickshell lists a network that is not saved or active only while the
    // scanner runs. It runs while a network popup is open, so a closed popup
    // or a reload always stops it.
    readonly property bool scanning: Popups.active.endsWith(":network")
    Binding {
        target: root.wifiDevice
        property: "scannerEnabled"
        value: root.scanning
        when: !!root.wifiDevice
    }

    // The networks of the Wi-Fi device: connected first, then saved, then by
    // signal bars, then by name. The bars and not the strength, so that the
    // rows do not move after each scan. Hidden networks (no name) are left out.
    readonly property var wifiNetworks: {
        if (!root.wifiDevice)
            return [];
        const bars = network => Math.min(4, Math.floor(network.signalStrength * 4));
        return root.wifiDevice.networks.values.filter(network => network.name !== "").sort((a, b) => (b.connected - a.connected) || (b.known - a.known) || (bars(b) - bars(a)) || a.name.localeCompare(b.name));
    }

    // The connected Wi-Fi network, or null.
    readonly property var wifiNetwork: {
        for (const device of Networking.devices.values) {
            if (device.type !== DeviceType.Wifi)
                continue;
            for (const network of device.networks.values) {
                if (network.connected)
                    return network;
            }
        }
        return null;
    }

    // A wired device counts as connected when it has a link.
    readonly property bool wiredConnected: {
        for (const device of Networking.devices.values) {
            if (device.type === DeviceType.Wired && (device.connected || device.hasLink))
                return true;
        }
        return false;
    }

    // "unknown" (no backend), "wifi", "ethernet" or "disconnected".
    readonly property string connectionType: {
        if (!root.backendAvailable)
            return "unknown";
        if (root.wifiNetwork)
            return "wifi";
        return root.wiredConnected ? "ethernet" : "disconnected";
    }
    readonly property string essid: root.wifiNetwork ? root.wifiNetwork.name : ""
    // Percent, 0 to 100 (the backend reports a 0 to 1 fraction).
    readonly property real signalStrength: root.wifiNetwork ? root.wifiNetwork.signalStrength * 100 : 0

    readonly property var wifiIcons: ["󰤯", "󰤟", "󰤢", "󰤥", "󰤨"]
    // Strength is 0 to 1.
    function wifiIcon(strength: real): string {
        return root.wifiIcons[Math.max(0, Math.min(4, Math.floor(strength * 4)))];
    }
    readonly property string icon: {
        switch (root.connectionType) {
        case "unknown":
            return "󰲊";
        case "wifi":
            return root.wifiIcon(root.signalStrength / 100);
        case "ethernet":
            return "󰈀";
        default:
            return "󰌙";
        }
    }

    // The error text of the last failed connect, by network name.
    property var connectErrors: ({})
    // Names of the networks that were not saved when a connect started. A
    // failed connect forgets the profile that the attempt saved, so that no
    // profile with a wrong password stays.
    property var newAttempts: ({})

    // A failed connect of a network that needs a password.
    signal passwordFailed(var network)

    // Security types that take a password through connectWithPsk().
    function needsPassword(security: int): bool {
        return security === WifiSecurityType.WpaPsk || security === WifiSecurityType.Wpa2Psk || security === WifiSecurityType.Sae;
    }

    // Security types that only the settings app can set up (802.1X, WEP).
    function needsSettingsApp(security: int): bool {
        return [WifiSecurityType.Wpa3SuiteB192, WifiSecurityType.Wpa2Eap, WifiSecurityType.WpaEap, WifiSecurityType.StaticWep, WifiSecurityType.DynamicWep, WifiSecurityType.Leap].includes(security);
    }

    function failText(reason: int): string {
        switch (reason) {
        case ConnectionFailReason.NoSecrets:
            return "Wrong or missing password";
        case ConnectionFailReason.WifiAuthTimeout:
            return "Authentication timed out";
        case ConnectionFailReason.WifiNetworkLost:
            return "Network not found";
        default:
            return "Connection failed";
        }
    }

    function setError(name: string, text: string): void {
        const errors = Object.assign({}, root.connectErrors);
        if (text === "")
            delete errors[name];
        else
            errors[name] = text;
        root.connectErrors = errors;
    }

    function setNewAttempt(name: string, isNew: bool): void {
        const attempts = Object.assign({}, root.newAttempts);
        if (isNew)
            attempts[name] = true;
        else
            delete attempts[name];
        root.newAttempts = attempts;
    }

    // An empty `psk` connects with the saved settings, or without a password.
    function connectTo(network: var, psk: string): void {
        root.setError(network.name, "");
        root.setNewAttempt(network.name, !network.known);
        if (psk !== "")
            network.connectWithPsk(psk);
        else
            network.connect();
    }

    function handleFailure(network: var, reason: int): void {
        if (root.newAttempts[network.name]) {
            root.setNewAttempt(network.name, false);
            network.forget();
        }
        root.setError(network.name, root.failText(reason));
        if (root.needsPassword(network.security))
            root.passwordFailed(network);
    }

    // The ObjectModel, not `wifiNetworks`: a re-sort of that list would
    // recreate every connection.
    Instantiator {
        model: root.wifiDevice ? root.wifiDevice.networks : []

        delegate: Connections {
            id: networkConnections
            required property var modelData
            target: networkConnections.modelData

            function onConnectionFailed(reason: int): void {
                root.handleFailure(networkConnections.modelData, reason);
            }

            function onConnectedChanged(): void {
                const network = networkConnections.modelData;
                if (!network.connected)
                    return;
                root.setNewAttempt(network.name, false);
                root.setError(network.name, "");
            }
        }
    }

    function toggleWifi(): void {
        Networking.wifiEnabled = !Networking.wifiEnabled;
    }
}
