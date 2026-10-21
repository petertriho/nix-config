pragma ComponentBehavior: Bound

import QtQuick
import "../../Common"

// Content of the caffeine popup: the on/off row, then the durations. It
// closes itself after `popups.timeoutMs`.
Column {
    id: root

    property var module

    spacing: Config.popups.itemSpacing

    // On starts caffeine with no time limit.
    Rectangle {
        width: root.width
        height: toggleText.height
        color: toggleMouse.containsMouse ? Config.style.hoverColor : "transparent"
        radius: Config.style.radiusSmall

        Text {
            id: toggleText
            text: CaffeineService.active ? "󰾪 Off" : "󰅶 On (indefinite)"
            color: Config.colors.base05
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize
            leftPadding: 8
            rightPadding: 8
            topPadding: 2
            bottomPadding: 2
        }

        MouseArea {
            id: toggleMouse
            anchors.fill: parent
            hoverEnabled: true
            onClicked: root.module.toggleIndefinite()
        }
    }

    Rectangle {
        width: root.width
        height: 1
        color: Config.style.borderColor
    }

    Repeater {
        model: [
            {
                label: "15m",
                value: 15
            },
            {
                label: "30m",
                value: 30
            },
            {
                label: "01h",
                value: 60
            },
            {
                label: "02h",
                value: 120
            },
            {
                label: "04h",
                value: 240
            },
            {
                label: "08h",
                value: 480
            }
        ]

        delegate: Rectangle {
            id: item

            required property var modelData

            width: root.width
            height: pickerRow.height
            color: pickerMouse.containsMouse ? Config.style.hoverColor : "transparent"
            radius: Config.style.radiusSmall

            Text {
                id: pickerRow
                text: item.modelData.label
                color: Config.colors.base05
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize
                leftPadding: 8
                rightPadding: 8
                topPadding: 2
                bottomPadding: 2
            }

            MouseArea {
                id: pickerMouse
                anchors.fill: parent
                hoverEnabled: true
                onClicked: root.module.activateWithDuration(item.modelData.value)
            }
        }
    }

    Timer {
        interval: Config.popups.timeoutMs
        running: !!root.module && root.module.popupOpen
        onTriggered: Popups.close()
    }
}
