pragma ComponentBehavior: Bound

import QtQuick
import "../../Common"

// Content of the battery popup.
Column {
    id: root

    property var module

    spacing: Config.popups.itemSpacing

    Text {
        text: "Battery"
        color: Config.colors.base05
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        font.bold: true
    }

    Repeater {
        model: root.module.batteries
        delegate: Column {
            id: battery

            required property var modelData

            width: root.width
            spacing: Config.popups.itemSpacing

            Item {
                width: 1
                height: battery.modelData.index === 0 ? 2 : 8
            }

            Text {
                text: "Battery " + (battery.modelData.index + 1)
                color: Config.colors.base03
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize - 1
                font.bold: true
            }

            Row {
                width: parent.width
                spacing: 8

                Text {
                    text: battery.modelData.icon + " " + battery.modelData.percentage + "%"
                    color: battery.modelData.isCritical ? Config.colors.base08 : (battery.modelData.isWarning ? Config.colors.base0A : Config.colors.base05)
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.fonts.defaultSize
                    width: 92
                }

                Text {
                    text: battery.modelData.stateLabel
                    color: battery.modelData.isPlugged ? Config.colors.base0B : Config.colors.base05
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.fonts.defaultSize
                    width: parent.width - 100
                    elide: Text.ElideRight
                }
            }

            Text {
                text: battery.modelData.isCritical ? "Critical" : (battery.modelData.isWarning ? "Warning" : "")
                visible: text !== ""
                color: battery.modelData.isCritical ? Config.colors.base08 : Config.colors.base0A
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize - 1
            }

            Repeater {
                model: root.module.detailRows(battery.modelData)
                delegate: StatRow {
                    required property var modelData

                    width: battery.width
                    label: modelData.label
                    value: modelData.value
                }
            }
        }
    }
}
