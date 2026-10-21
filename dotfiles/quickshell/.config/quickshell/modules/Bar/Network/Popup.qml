pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Networking
import ".."
import "../../Common"

// Content of the network popup: the Wi-Fi switch, the Ethernet state and the
// Wi-Fi networks. A click on a network connects or disconnects it. A new
// network with a password opens a password field under its row. 802.1X and
// WEP networks open the settings app.
Column {
    id: root

    property var module
    // The network whose password field is open, or null.
    property var passwordNetwork: null

    spacing: Config.popups.itemSpacing

    function activate(network: var): void {
        if (network.connected) {
            network.disconnect();
        } else if (network.stateChanging) {
            return;
        } else if (network.known) {
            NetworkService.connectTo(network, "");
        } else if (NetworkService.needsSettingsApp(network.security)) {
            root.module.openSettings();
        } else if (NetworkService.needsPassword(network.security)) {
            root.passwordNetwork = root.passwordNetwork === network ? null : network;
        } else {
            NetworkService.connectTo(network, "");
        }
    }

    function statusText(network: var): string {
        let text = "";
        if (network.state === ConnectionState.Connecting)
            text = "Connecting…";
        else if (network.state === ConnectionState.Disconnecting)
            text = "Disconnecting…";
        else if (network.connected)
            text = "Connected";
        else if (network.known)
            text = "Saved";
        else if (NetworkService.needsSettingsApp(network.security))
            text = network.security === WifiSecurityType.StaticWep ? "WEP" : "802.1X";
        const locked = NetworkService.needsPassword(network.security) || NetworkService.needsSettingsApp(network.security);
        return locked ? (text === "" ? "󰌾" : text + " 󰌾") : text;
    }

    function linkSpeedText(speed: int): string {
        if (speed <= 0)
            return "";
        return speed >= 1000 ? " · " + speed / 1000 + " Gb/s" : " · " + speed + " Mb/s";
    }

    // A failed connect asks for the password again.
    Connections {
        target: NetworkService

        function onPasswordFailed(network: var): void {
            root.passwordNetwork = network;
        }
    }

    component EmptyText: Text {
        color: Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
    }

    // A network row, its password field and its last error.
    component NetworkEntry: Column {
        id: entry

        required property var modelData
        readonly property bool passwordOpen: root.passwordNetwork === entry.modelData
        readonly property string error: NetworkService.connectErrors[entry.modelData.name] || ""

        width: root.width
        spacing: 2

        onPasswordOpenChanged: {
            passwordInput.text = "";
            if (entry.passwordOpen)
                passwordInput.forceActiveFocus();
        }

        function submit(): void {
            if (passwordInput.text === "")
                return;
            NetworkService.connectTo(entry.modelData, passwordInput.text);
            root.passwordNetwork = null;
        }

        PopupListRow {
            width: entry.width
            current: entry.modelData.connected
            icon: NetworkService.wifiIcon(entry.modelData.signalStrength)
            label: entry.modelData.name
            status: root.statusText(entry.modelData)
            onClicked: root.activate(entry.modelData)
        }

        Item {
            width: entry.width
            height: 26
            visible: entry.passwordOpen

            Rectangle {
                anchors.left: parent.left
                anchors.leftMargin: 4
                anchors.right: connectButton.left
                anchors.rightMargin: 6
                anchors.verticalCenter: parent.verticalCenter
                height: parent.height
                radius: Config.style.radiusSmall
                color: Config.style.cardColor
                border.width: 1
                border.color: passwordInput.activeFocus ? Config.style.accentColor : Config.style.borderColor

                TextInput {
                    id: passwordInput
                    anchors.fill: parent
                    anchors.leftMargin: 8
                    anchors.rightMargin: 8
                    verticalAlignment: TextInput.AlignVCenter
                    echoMode: TextInput.Password
                    clip: true
                    color: Config.colors.base05
                    selectionColor: Config.colors.base02
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.fonts.defaultSize - 1
                    Keys.onReturnPressed: entry.submit()
                    Keys.onEnterPressed: entry.submit()
                    // The overlay backdrop handles Escape only while it has the
                    // focus.
                    Keys.onEscapePressed: Popups.close()
                }

                Text {
                    anchors.fill: passwordInput
                    verticalAlignment: Text.AlignVCenter
                    visible: passwordInput.text === ""
                    text: "Password"
                    color: Config.colors.base03
                    font: passwordInput.font
                }
            }

            Rectangle {
                id: connectButton
                anchors.right: parent.right
                anchors.rightMargin: 4
                anchors.verticalCenter: parent.verticalCenter
                width: connectText.implicitWidth + 16
                height: parent.height
                radius: Config.style.radiusSmall
                color: connectMouse.containsMouse ? Config.style.hoverColor : Config.colors.base02

                Text {
                    id: connectText
                    anchors.centerIn: parent
                    text: "Connect"
                    color: Config.colors.base05
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.fonts.defaultSize - 1
                }

                MouseArea {
                    id: connectMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: entry.submit()
                }
            }
        }

        Text {
            x: Config.fonts.defaultSize + 12
            width: entry.width - x
            visible: entry.error !== ""
            text: entry.error
            color: Config.colors.base08
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize - 1
            elide: Text.ElideRight
        }
    }

    PopupToggle {
        width: root.width
        label: "Wi-Fi"
        checked: Networking.wifiEnabled
        enabled: !!NetworkService.wifiDevice && Networking.wifiHardwareEnabled
        note: !NetworkService.wifiDevice ? "No Wi-Fi device" : !Networking.wifiHardwareEnabled ? "Blocked by hardware switch" : ""
        onToggled: NetworkService.toggleWifi()
    }

    StatRow {
        width: root.width
        visible: !!NetworkService.wiredDevice
        label: "Ethernet"
        value: NetworkService.wiredConnected ? "Connected" + root.linkSpeedText(NetworkService.wiredDevice.linkSpeed) : "Disconnected"
        valueColor: NetworkService.wiredConnected ? Config.colors.base0B : Config.colors.base03
    }

    Item {
        width: 1
        height: 2
    }

    // A ScriptModel keeps the row of a network when the list sorts again, so
    // that a password being typed stays.
    Repeater {
        model: ScriptModel {
            values: Networking.wifiEnabled ? NetworkService.wifiNetworks : []
        }

        delegate: NetworkEntry {}
    }

    EmptyText {
        visible: !!NetworkService.wifiDevice && (!Networking.wifiEnabled || NetworkService.wifiNetworks.length === 0)
        text: Networking.wifiEnabled ? "Searching for networks…" : "Wi-Fi is off"
    }

    SettingsFooter {
        width: root.width
        module: root.module
    }
}
