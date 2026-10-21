pragma ComponentBehavior: Bound

import QtQuick
import "../../Common"

// Content of the Bluetooth popup: the adapter switch, the connected and paired
// devices, and the new devices that a scan finds. A click on a device
// connects, disconnects or pairs it. blueman-applet shows the PIN prompts.
Column {
    id: root

    property var module

    spacing: Config.popups.itemSpacing

    component SectionTitle: Text {
        color: Config.colors.base05
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        font.bold: true
    }

    component EmptyText: Text {
        color: Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
    }

    component Spacer: Item {
        width: 1
        height: 4
    }

    component DeviceRow: PopupListRow {
        id: deviceRow

        required property var modelData

        width: root.width
        enabled: root.module.adapterEnabled
        current: deviceRow.modelData.connected
        icon: root.module.deviceIcon(deviceRow.modelData)
        label: root.module.displayName(deviceRow.modelData)
        status: root.module.statusText(deviceRow.modelData)
        statusColor: deviceRow.modelData.connected ? Config.colors.base0D : Config.colors.base03
        onClicked: root.module.activate(deviceRow.modelData)
    }

    PopupToggle {
        width: root.width
        label: "Bluetooth"
        checked: root.module.adapterEnabled
        enabled: root.module.adapterAvailable
        note: root.module.adapterAvailable ? root.module.adapter.name || root.module.adapter.adapterId : "No adapter"
        onToggled: root.module.toggleAdapter()
    }

    Spacer {}

    SectionTitle {
        text: "Connected"
        visible: root.module.connectedDevices.length > 0
    }

    Repeater {
        model: root.module.connectedDevices
        delegate: DeviceRow {}
    }

    SectionTitle {
        text: "Paired"
        visible: root.module.pairedDevices.length > 0
    }

    Repeater {
        model: root.module.pairedDevices
        delegate: DeviceRow {}
    }

    EmptyText {
        visible: root.module.connectedDevices.length === 0 && root.module.pairedDevices.length === 0
        text: "No paired devices"
    }

    Spacer {
        visible: root.module.adapterEnabled
    }

    // The title, with the Scan button on the right.
    Item {
        width: root.width
        height: Math.max(availableTitle.implicitHeight, scanButton.height)
        visible: root.module.adapterEnabled

        SectionTitle {
            id: availableTitle
            anchors.verticalCenter: parent.verticalCenter
            text: "Available"
        }

        Rectangle {
            id: scanButton
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            width: scanText.implicitWidth + 16
            height: scanText.implicitHeight + 6
            radius: Config.style.radiusSmall
            color: scanMouse.containsMouse ? Config.style.hoverColor : Config.colors.base02

            Text {
                id: scanText
                anchors.centerIn: parent
                text: root.module.scanning ? "Stop" : "Scan"
                color: Config.colors.base05
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize - 1
            }

            MouseArea {
                id: scanMouse
                anchors.fill: parent
                hoverEnabled: true
                onClicked: root.module.scanRequested = !root.module.scanRequested
            }
        }
    }

    Repeater {
        model: root.module.adapterEnabled ? root.module.availableDevices : []
        delegate: DeviceRow {}
    }

    EmptyText {
        visible: root.module.adapterEnabled && root.module.availableDevices.length === 0
        text: root.module.scanning ? "Searching for devices…" : "Scan to find new devices"
    }

    SettingsFooter {
        width: root.width
        module: root.module
    }
}
