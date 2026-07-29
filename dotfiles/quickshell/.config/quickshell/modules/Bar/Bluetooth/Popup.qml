import QtQuick
import Quickshell
import "../../Common"

OverlayHost {
    id: bluetoothPopup

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
        id: bluetoothCard
        readonly property real preferredHeight: bluetoothPopupCol.implicitHeight + bluetoothPopup.popupMargin
        readonly property real availableHeight: Math.max(1, (parent ? parent.height : preferredHeight) - y - bluetoothPopup.popupMargin)

        width: 320
        height: Math.min(preferredHeight, availableHeight)
        x: module ? module.popupX(width) : 0
        y: (barWindow ? barWindow.height : 0) + 4
        color: colors.base01
        border.color: colors.base10
        radius: bluetoothPopup.popupCornerRadius
        opacity: bluetoothPopup.open ? 1.0 : 0.0
        scale: bluetoothPopup.open ? 1.0 : 0.98
        transformOrigin: Item.Top

        Behavior on opacity {
            NumberAnimation {
                duration: bluetoothPopup.animationDurationMs
            }
        }
        Behavior on scale {
            NumberAnimation {
                duration: bluetoothPopup.animationDurationMs
            }
        }

        Flickable {
            id: bluetoothFlick
            x: bluetoothPopup.popupPadding / 2
            y: bluetoothPopup.popupMargin / 2
            width: Math.max(1, parent.width - bluetoothPopup.popupPadding)
            height: Math.max(1, parent.height - bluetoothPopup.popupMargin)
            clip: true
            contentWidth: width
            contentHeight: bluetoothPopupCol.implicitHeight
            boundsBehavior: Flickable.StopAtBounds
            interactive: contentHeight > height

            Column {
                id: bluetoothPopupCol
                width: bluetoothFlick.width
                spacing: bluetoothPopup.popupItemSpacing

                Text {
                    text: "Bluetooth"
                    color: colors.base05
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                }

                Text {
                    text: module.adapterText()
                    color: module.enabled ? colors.base0B : colors.base03
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    elide: Text.ElideRight
                    width: parent.width
                }

                Item {
                    width: 1
                    height: 4
                }

                Text {
                    text: "Connected"
                    color: colors.base05
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                    visible: module.connectedDevices.length > 0
                }

                Repeater {
                    model: module.connectedDevices
                    delegate: Row {
                        width: bluetoothPopupCol.width
                        spacing: 8

                        Text {
                            text: module.displayName(modelData)
                            color: colors.base05
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize
                            width: parent.width - 92
                            elide: Text.ElideRight
                        }

                        Text {
                            text: module.statusText(modelData)
                            color: colors.base0D
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            width: 84
                            horizontalAlignment: Text.AlignRight
                            elide: Text.ElideRight
                        }
                    }
                }

                Text {
                    text: "No connected devices"
                    color: colors.base03
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    visible: module.connectedDevices.length === 0
                }

                Item {
                    width: 1
                    height: 4
                }

                Text {
                    text: "Paired"
                    color: colors.base05
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                    visible: module.pairedDevices.length > 0
                }

                Repeater {
                    model: module.pairedDevices
                    delegate: Row {
                        width: bluetoothPopupCol.width
                        spacing: 8

                        Text {
                            text: module.displayName(modelData)
                            color: modelData.connected ? colors.base05 : colors.base03
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize
                            width: parent.width - 92
                            elide: Text.ElideRight
                        }

                        Text {
                            text: module.statusText(modelData)
                            color: modelData.connected ? colors.base0D : colors.base03
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            width: 84
                            horizontalAlignment: Text.AlignRight
                            elide: Text.ElideRight
                        }
                    }
                }

                Text {
                    text: module.available ? "No paired devices" : "Bluetooth adapter unavailable"
                    color: colors.base03
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    visible: module.pairedDevices.length === 0
                }

                Item {
                    width: 1
                    height: 6
                }

                Rectangle {
                    width: parent.width
                    height: openBluemanText.height + 8
                    color: openBluemanMouse.containsMouse ? colors.base02 : "transparent"
                    radius: 4

                    Text {
                        id: openBluemanText
                        anchors.centerIn: parent
                        text: "Open Bluetooth Settings"
                        color: colors.base05
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize
                    }

                    MouseArea {
                        id: openBluemanMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: {
                            module.showPopup = false;
                            Quickshell.execDetached({
                                command: ["blueman-manager"]
                            });
                        }
                    }
                }
            }
        }
    }
}
