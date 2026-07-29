import QtQuick
import "../../Common"

OverlayHost {
    id: caffeinePicker

    property var module
    property var barWindow
    property QtObject colors
    property QtObject fontsConfig
    property QtObject popupsConfig
    property QtObject overlayConfig
    animationDurationMs: overlayConfig ? overlayConfig.animationDurationMs : 180
    closeGraceMs: overlayConfig ? overlayConfig.closeGraceMs : 220
    screen: barWindow ? barWindow.screen : null
    open: module && module.showPicker
    onCloseRequested: if (module)
        module.showPicker = false

    readonly property int popupPadding: popupsConfig ? popupsConfig.padding : 16
    readonly property int popupMargin: popupsConfig ? popupsConfig.margin : 8
    readonly property int popupCornerRadius: popupsConfig ? popupsConfig.cornerRadius : 4
    readonly property int popupItemSpacing: popupsConfig ? popupsConfig.itemSpacing : 4
    readonly property int popupTimeoutMs: popupsConfig ? popupsConfig.timeoutMs : 3000

    Rectangle {
        id: pickerCard
        readonly property real preferredHeight: pickerCol.implicitHeight + caffeinePicker.popupMargin
        readonly property real availableHeight: Math.max(1, (parent ? parent.height : preferredHeight) - y - caffeinePicker.popupMargin)

        width: pickerCol.implicitWidth + caffeinePicker.popupPadding
        height: Math.min(preferredHeight, availableHeight)
        x: module ? module.popupAnchorX(width) : 0
        y: barWindow ? barWindow.height : 0
        color: colors.base01
        border.color: colors.base10
        radius: caffeinePicker.popupCornerRadius
        opacity: caffeinePicker.open ? 1.0 : 0.0
        scale: caffeinePicker.open ? 1.0 : 0.98
        transformOrigin: Item.Top

        Behavior on opacity {
            NumberAnimation {
                duration: caffeinePicker.animationDurationMs
            }
        }
        Behavior on scale {
            NumberAnimation {
                duration: caffeinePicker.animationDurationMs
            }
        }

        Flickable {
            id: pickerFlick
            x: caffeinePicker.popupPadding / 2
            y: caffeinePicker.popupMargin / 2
            width: Math.max(1, parent.width - caffeinePicker.popupPadding)
            height: Math.max(1, parent.height - caffeinePicker.popupMargin)
            clip: true
            contentWidth: pickerCol.implicitWidth
            contentHeight: pickerCol.implicitHeight
            boundsBehavior: Flickable.StopAtBounds
            interactive: contentHeight > height

            Column {
                id: pickerCol
                spacing: caffeinePicker.popupItemSpacing

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
                        width: pickerRow.width
                        height: pickerRow.height
                        color: pickerMouse.containsMouse ? colors.base02 : "transparent"
                        radius: 2

                        Text {
                            id: pickerRow
                            text: modelData.label
                            color: colors.base05
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize
                            leftPadding: 8
                            rightPadding: 8
                            topPadding: 2
                            bottomPadding: 2
                        }

                        MouseArea {
                            id: pickerMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: module.activateWithDuration(modelData.value)
                        }
                    }
                }
            }
        }
    }

    Timer {
        id: pickerTimer
        interval: caffeinePicker.popupTimeoutMs
        running: module && module.showPicker
        onTriggered: if (module)
            module.showPicker = false
    }
}
