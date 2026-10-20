pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Networking

// Network state for every bar. The bindings read notifying properties of the
// Networking objects, so they update without polling or a per-bar scan.
Singleton {
    id: root

    // False when Quickshell found no network backend at start (NetworkManager
    // was not on the bus yet). A reload does not retry, only a restart does.
    readonly property bool backendAvailable: Networking.backend !== NetworkBackendType.None

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
    readonly property string icon: {
        switch (root.connectionType) {
        case "unknown":
            return "󰲊";
        case "wifi":
            return root.wifiIcons[Math.max(0, Math.min(4, Math.floor(root.signalStrength / 25)))];
        case "ethernet":
            return "󰈀";
        default:
            return "󰌙";
        }
    }
}
