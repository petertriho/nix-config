import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import "../Common"

// The notification center: the "notifications" drawer, top-right.
OverlayHost {
    id: root

    // NotificationService.centerEntries.
    required property var entries

    property real clock
    readonly property int animationMs: 180
    readonly property int topMargin: Config.bar.height + Config.style.gap
    readonly property int maxPanelHeight: Math.max(1, Screen.height - root.topMargin - Config.notifications.bottomMargin)
    readonly property int maxListHeight: Math.max(1, maxPanelHeight - headerRow.implicitHeight - Config.notifications.spacing - Config.style.padding * 2)
    readonly property real listHeight: Math.min(listView.contentHeight, maxListHeight)

    signal clearRequested

    // Mod (Super) combos reach the overlay via exclusive focus while the center is open.
    // Mod+B closes (completing the toggle); Mod+Shift+B clears all (and closes).
    onKeyPressed: function (event) {
        if (event.key === Qt.Key_B && (event.modifiers & Qt.MetaModifier)) {
            if (event.modifiers & Qt.ShiftModifier)
                root.clearRequested();
            else
                root.closeRequested();
            event.accepted = true;
        }
    }

    PopupCard {
        id: drawer
        open: root.open
        preferredWidth: Config.notifications.drawerWidth
        maxHeight: root.maxPanelHeight
        x: root.width - width - Config.style.gap
        y: root.topMargin
        // Popover settle: fade + slight scale from the top-right corner.
        transformOrigin: Item.TopRight

        ColumnLayout {
            id: panelColumn
            width: parent.width
            spacing: Config.notifications.spacing

            RowLayout {
                id: headerRow

                Layout.fillWidth: true
                Layout.alignment: Qt.AlignTop

                Text {
                    text: "Notifications"
                    color: Config.colors.base06
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.notifications.headerFontSize
                    font.bold: true
                    Layout.fillWidth: true
                    Layout.alignment: Qt.AlignVCenter
                }

                Text {
                    text: "󰆳 Clear"
                    visible: root.entries.length > 0
                    color: clearMouse.containsMouse ? Config.colors.base08 : Config.colors.base03
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.notifications.headerFontSize
                    Layout.alignment: Qt.AlignVCenter

                    MouseArea {
                        id: clearMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: root.clearRequested()
                    }
                }

                Text {
                    text: "󰅖"
                    color: closeMouse.containsMouse ? Config.colors.base08 : Config.colors.base03
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.notifications.headerFontSize
                    Layout.alignment: Qt.AlignVCenter

                    MouseArea {
                        id: closeMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: root.closeRequested()
                    }
                }
            }

            Text {
                id: emptyText

                visible: root.entries.length === 0
                text: "No notifications"
                color: Config.colors.base03
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.notifications.bodyFontSize
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
                Layout.alignment: Qt.AlignTop
                Layout.topMargin: 32
                Layout.bottomMargin: 40
            }

            ScrollView {
                visible: root.entries.length > 0
                Layout.fillWidth: true
                Layout.preferredHeight: root.listHeight
                Layout.maximumHeight: root.maxListHeight
                clip: true

                ListView {
                    id: listView
                    spacing: Config.notifications.spacing
                    model: ScriptModel {
                        values: root.entries
                        objectProp: "key"
                    }

                    delegate: Card {
                        id: card

                        required property var modelData

                        width: listView.width
                        entry: card.modelData
                        inCenter: true
                        clock: root.clock
                    }

                    add: Transition {
                        ParallelAnimation {
                            NumberAnimation { property: "opacity"; from: 0; to: 1; duration: root.animationMs; easing.type: Easing.OutCubic }
                            NumberAnimation { property: "scale"; from: 0.95; to: 1; duration: root.animationMs; easing.type: Easing.OutCubic }
                        }
                    }

                    remove: Transition {
                        ParallelAnimation {
                            NumberAnimation { property: "opacity"; to: 0; duration: root.animationMs; easing.type: Easing.InCubic }
                            NumberAnimation { property: "scale"; to: 0.95; duration: root.animationMs; easing.type: Easing.InCubic }
                        }
                    }

                    // A replaced notification moves to the top.
                    move: Transition {
                        NumberAnimation { property: "y"; duration: root.animationMs; easing.type: Easing.OutCubic }
                    }

                    // Also completes an add transition that a second change interrupted.
                    displaced: Transition {
                        NumberAnimation { property: "y"; duration: root.animationMs; easing.type: Easing.OutCubic }
                        NumberAnimation { properties: "opacity,scale"; to: 1; duration: root.animationMs; easing.type: Easing.OutCubic }
                    }
                }
            }
        }
    }

    Timer {
        interval: 60000
        repeat: true
        running: root.visible
        triggeredOnStart: true
        onTriggered: root.clock = Date.now()
    }
}
