import QtQuick
import "../../Common"

OverlayHost {
    id: batteryPopup

    property var module
    property var barWindow
    property QtObject colors
    property QtObject fontsConfig
    property QtObject popupsConfig
    property QtObject overlayConfig
    animationDurationMs: overlayConfig ? overlayConfig.animationDurationMs : 180
    closeGraceMs: overlayConfig ? overlayConfig.closeGraceMs : 220
    screen: barWindow ? barWindow.screen : null
    open: module && module.showPopup
    onCloseRequested: if (module)
        module.showPopup = false

    readonly property int popupPadding: popupsConfig ? popupsConfig.padding : 16
    readonly property int popupMargin: popupsConfig ? popupsConfig.margin : 8
    readonly property int popupCornerRadius: popupsConfig ? popupsConfig.cornerRadius : 4
    readonly property int popupItemSpacing: popupsConfig ? popupsConfig.itemSpacing : 4

    Rectangle {
        id: batteryCard
        readonly property real preferredHeight: batteryPopupCol.implicitHeight + batteryPopup.popupMargin
        readonly property real availableHeight: Math.max(1, (parent ? parent.height : preferredHeight) - y - batteryPopup.popupMargin)

        width: 360
        height: Math.min(preferredHeight, availableHeight)
        x: module ? module.popupX(width) : 0
        y: (barWindow ? barWindow.height : 0) + 4
        color: colors.base01
        border.color: colors.base10
        radius: batteryPopup.popupCornerRadius
        opacity: batteryPopup.open ? 1.0 : 0.0
        scale: batteryPopup.open ? 1.0 : 0.98
        transformOrigin: Item.Top

        Behavior on opacity {
            NumberAnimation {
                duration: batteryPopup.animationDurationMs
            }
        }
        Behavior on scale {
            NumberAnimation {
                duration: batteryPopup.animationDurationMs
            }
        }

        Flickable {
            id: batteryFlick
            x: batteryPopup.popupPadding / 2
            y: batteryPopup.popupMargin / 2
            width: Math.max(1, parent.width - batteryPopup.popupPadding)
            height: Math.max(1, parent.height - batteryPopup.popupMargin)
            clip: true
            contentWidth: width
            contentHeight: batteryPopupCol.implicitHeight
            boundsBehavior: Flickable.StopAtBounds
            interactive: contentHeight > height

            Column {
                id: batteryPopupCol
                width: batteryFlick.width
                spacing: batteryPopup.popupItemSpacing

                Text {
                    text: "Battery"
                    color: colors.base05
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                }

                Repeater {
                    model: module.batteries
                    delegate: Column {
                        width: batteryPopupCol.width
                        spacing: batteryPopup.popupItemSpacing

                        Item {
                            width: 1
                            height: modelData.index === 0 ? 2 : 8
                        }

                        Text {
                            text: "Battery " + (modelData.index + 1)
                            color: colors.base04
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            font.bold: true
                        }

                        Row {
                            width: parent.width
                            spacing: 8

                            Text {
                                text: modelData.icon + " " + modelData.percentage + "%"
                                color: modelData.isCritical ? colors.base08 : (modelData.isWarning ? colors.base0A : colors.base05)
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize
                                width: 92
                            }

                            Text {
                                text: modelData.state
                                color: modelData.isPlugged ? colors.base0B : colors.base05
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize
                                width: parent.width - 100
                                elide: Text.ElideRight
                            }
                        }

                        Text {
                            text: modelData.isCritical ? "Critical" : (modelData.isWarning ? "Warning" : "")
                            visible: text !== ""
                            color: modelData.isCritical ? colors.base08 : colors.base0A
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                        }

                        Repeater {
                            model: module.detailRows(modelData)
                            delegate: Row {
                                width: batteryPopupCol.width
                                spacing: 8

                                Text {
                                    text: modelData.label
                                    color: colors.base04
                                    font.family: fontsConfig.defaultFamily
                                    font.pixelSize: fontsConfig.defaultSize - 1
                                    width: 112
                                    elide: Text.ElideRight
                                }

                                Text {
                                    text: modelData.value
                                    color: colors.base05
                                    font.family: fontsConfig.defaultFamily
                                    font.pixelSize: fontsConfig.defaultSize - 1
                                    width: parent.width - 120
                                    horizontalAlignment: Text.AlignRight
                                    elide: Text.ElideRight
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
