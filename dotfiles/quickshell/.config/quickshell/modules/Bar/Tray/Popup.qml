import QtQuick
import Quickshell.Services.SystemTray
import Quickshell.Widgets
import "../../Common"

OverlayHost {
    id: trayPopup

    property var module
    property var barWindow
    property QtObject colors
    property QtObject fontsConfig
    property QtObject popupsConfig
    property QtObject overlayConfig
    property var hiddenIds: []
    property var idMap: ({})
    property var overflowNames: ({})
    animationDurationMs: overlayConfig ? overlayConfig.animationDurationMs : 180
    closeGraceMs: overlayConfig ? overlayConfig.closeGraceMs : 220
    screen: barWindow ? barWindow.screen : null
    open: module && module.expanded
    onCloseRequested: if (module)
        module.expanded = false

    Rectangle {
        id: trayCard
        readonly property int popupPadding: popupsConfig ? popupsConfig.padding : 16
        readonly property int popupMargin: popupsConfig ? popupsConfig.margin : 8
        readonly property real preferredHeight: trayPopupCol.implicitHeight + popupMargin
        readonly property real availableHeight: Math.max(1, (parent ? parent.height : preferredHeight) - y - popupMargin)

        width: trayPopupCol.implicitWidth + popupPadding
        height: Math.min(preferredHeight, availableHeight)
        x: module ? module.popupX(width) : 0
        y: (barWindow ? barWindow.height : 0) + 4
        color: colors.base01
        border.color: colors.base10
        radius: popupsConfig.cornerRadius
        opacity: trayPopup.open ? 1.0 : 0.0
        scale: trayPopup.open ? 1.0 : 0.98
        transformOrigin: Item.Top

        Behavior on opacity {
            NumberAnimation {
                duration: trayPopup.animationDurationMs
            }
        }
        Behavior on scale {
            NumberAnimation {
                duration: trayPopup.animationDurationMs
            }
        }

        Flickable {
            id: trayFlick
            x: trayCard.popupPadding / 2
            y: trayCard.popupMargin / 2
            width: Math.max(1, parent.width - trayCard.popupPadding)
            height: Math.max(1, parent.height - trayCard.popupMargin)
            clip: true
            contentWidth: trayPopupCol.implicitWidth
            contentHeight: trayPopupCol.implicitHeight
            boundsBehavior: Flickable.StopAtBounds
            interactive: contentHeight > height

            Column {
                id: trayPopupCol
                spacing: popupsConfig.itemSpacing

                Row {
                    id: trayRow
                    spacing: popupsConfig.itemSpacing

                    Repeater {
                        model: SystemTray.items
                        delegate: Item {
                            readonly property int _iconSize: popupsConfig.trayIconSize > 0 ? popupsConfig.trayIconSize : fontsConfig.defaultSize + popupsConfig.trayIconOffset
                            readonly property int _pad: 8
                            width: _iconSize + _pad * 2
                            height: _iconSize + _pad * 2

                            Rectangle {
                                anchors.fill: parent
                                radius: 4
                                color: mouse.containsMouse ? colors.base02 : "transparent"
                            }

                            IconImage {
                                id: icon
                                anchors.centerIn: parent
                                implicitSize: parent._iconSize
                                source: modelData.icon
                            }

                            MouseArea {
                                id: mouse
                                anchors.fill: parent
                                hoverEnabled: true
                                acceptedButtons: Qt.LeftButton | Qt.RightButton
                                onClicked: function (mse) {
                                    const ix = mse.x - (width - icon.width) / 2;
                                    const iy = mse.y - (height - icon.height) / 2;
                                    if (mse.button === Qt.RightButton) {
                                        modelData.secondaryActivate(ix, iy);
                                    } else {
                                        modelData.activate(ix, iy);
                                    }
                                }
                            }
                        }
                    }
                }

                // Overflow: right-side bar modules hidden to make room for
                // the centered clock, reachable here via their normal click
                // action. Nothing hidden → the row is not rendered.
                Row {
                    spacing: popupsConfig.itemSpacing
                    visible: hiddenIds.length > 0

                    Repeater {
                        model: hiddenIds
                        delegate: Item {
                            readonly property var _mod: idMap[modelData]
                            width: ovContent.width + 16
                            height: fontsConfig.defaultSize + 12

                            Rectangle {
                                anchors.fill: parent
                                radius: 4
                                color: ovMouse.containsMouse ? colors.base02 : "transparent"
                            }

                            Row {
                                id: ovContent
                                anchors.verticalCenter: parent.verticalCenter
                                anchors.left: parent.left
                                anchors.leftMargin: 8
                                spacing: 6

                                Text {
                                    text: _mod ? _mod.text : ""
                                    color: colors.base05
                                    font.family: fontsConfig.defaultFamily
                                    font.pixelSize: fontsConfig.defaultSize
                                }

                                Text {
                                    text: overflowNames[modelData] || modelData
                                    color: colors.base05
                                    font.family: fontsConfig.defaultFamily
                                    font.pixelSize: fontsConfig.defaultSize
                                }
                            }

                            MouseArea {
                                id: ovMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                onClicked: if (_mod)
                                    _mod.clicked()
                            }
                        }
                    }
                }
            }
        }
    }
}
