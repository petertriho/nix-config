pragma ComponentBehavior: Bound

import QtQuick

// Rows of a popup menu. An entry is a separator ({separator: true}) or an
// item ({icon, label, color, disabled}). A click on an item that is not
// disabled emits `triggered` with its entry. The parent sets the width.
Column {
    id: root

    property var entries: []
    readonly property int iconWidth: Config.fonts.defaultSize + 8

    signal triggered(var entry)

    Repeater {
        model: root.entries

        delegate: Item {
            id: entry

            required property var modelData
            readonly property bool separator: !!entry.modelData.separator
            readonly property bool disabled: !!entry.modelData.disabled

            width: root.width
            height: entry.separator ? 9 : entryLabel.implicitHeight + 8

            Rectangle {
                visible: entry.separator
                x: 8
                width: parent.width - 16
                height: 1
                anchors.verticalCenter: parent.verticalCenter
                color: Config.style.borderColor
            }

            Rectangle {
                anchors.fill: parent
                visible: !entry.separator
                radius: Config.style.radiusSmall
                color: entryMouse.containsMouse ? Config.style.hoverColor : "transparent"
            }

            Text {
                id: entryIcon
                x: 8
                width: root.iconWidth
                anchors.verticalCenter: parent.verticalCenter
                visible: !entry.separator
                text: entry.modelData.icon || ""
                color: entry.disabled ? Config.colors.base03 : entry.modelData.color || Config.colors.base04
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize
            }

            Text {
                id: entryLabel
                anchors.left: entryIcon.right
                anchors.right: parent.right
                anchors.rightMargin: 8
                anchors.verticalCenter: parent.verticalCenter
                visible: !entry.separator
                text: entry.modelData.label || ""
                color: entry.disabled ? Config.colors.base03 : entry.modelData.color || Config.colors.base05
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize
                elide: Text.ElideRight
            }

            MouseArea {
                id: entryMouse
                anchors.fill: parent
                enabled: !entry.separator && !entry.disabled
                hoverEnabled: true
                onClicked: root.triggered(entry.modelData)
            }
        }
    }
}
