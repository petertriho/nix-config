pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import "../../Common"

// Content of the Bluetooth popup.
Column {
    id: root

    property var module

    spacing: Config.popups.itemSpacing

    // One device: the name fills the width that the status text leaves.
    Component {
        id: deviceRow

        Item {
            id: row

            required property var modelData

            width: root.width
            implicitHeight: Math.max(nameText.implicitHeight, statusText.implicitHeight)

            Text {
                id: statusText
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                text: root.module.statusText(row.modelData)
                color: row.modelData.connected ? Config.colors.base0D : Config.colors.base03
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize - 1
            }

            Text {
                id: nameText
                anchors.left: parent.left
                anchors.right: statusText.left
                anchors.rightMargin: 8
                anchors.verticalCenter: parent.verticalCenter
                text: root.module.displayName(row.modelData)
                color: row.modelData.connected ? Config.colors.base05 : Config.colors.base03
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize
                elide: Text.ElideRight
            }
        }
    }

    Text {
        text: "Bluetooth"
        color: Config.colors.base05
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        font.bold: true
    }

    Text {
        text: root.module.adapterText()
        color: root.module.adapterEnabled ? Config.colors.base0B : Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        elide: Text.ElideRight
        width: parent.width
    }

    Item {
        width: 1
        height: 4
    }

    Text {
        text: "Connected"
        color: Config.colors.base05
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        font.bold: true
        visible: root.module.connectedDevices.length > 0
    }

    Repeater {
        model: root.module.connectedDevices
        delegate: deviceRow
    }

    Text {
        text: "No connected devices"
        color: Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        visible: root.module.connectedDevices.length === 0
    }

    Item {
        width: 1
        height: 4
    }

    Text {
        text: "Paired"
        color: Config.colors.base05
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        font.bold: true
        visible: root.module.pairedDevices.length > 0
    }

    Repeater {
        model: root.module.pairedDevices
        delegate: deviceRow
    }

    Text {
        text: root.module.adapterAvailable ? "No paired devices" : "Bluetooth adapter unavailable"
        color: Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        visible: root.module.pairedDevices.length === 0
    }

    Item {
        width: 1
        height: 6
    }

    Rectangle {
        width: parent.width
        height: openBluemanText.height + 8
        color: openBluemanMouse.containsMouse ? Config.style.hoverColor : "transparent"
        radius: Config.style.radiusSmall

        Text {
            id: openBluemanText
            anchors.centerIn: parent
            text: "Open Bluetooth Settings"
            color: Config.colors.base05
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize
        }

        MouseArea {
            id: openBluemanMouse
            anchors.fill: parent
            hoverEnabled: true
            onClicked: {
                Popups.close();
                Quickshell.execDetached({
                    command: ["blueman-manager"]
                });
            }
        }
    }
}
