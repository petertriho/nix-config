import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Wayland

PanelWindow {
    id: root

    required property var centerModel
    required property QtObject colors
    required property QtObject fontsConfig
    required property QtObject notificationsConfig

    property bool open: false
    property real clock
    readonly property int maxPanelHeight: Math.max(1, Screen.height - notificationsConfig.topMargin - notificationsConfig.bottomMargin)
    readonly property int maxListHeight: Math.max(1, maxPanelHeight - headerRow.implicitHeight - notificationsConfig.spacing - notificationsConfig.cardPadding * 2)
    readonly property real listHeight: Math.min(listView.contentHeight, maxListHeight)
    readonly property real emptyHeight: emptyText.implicitHeight + 72
    readonly property real contentHeight: notificationsConfig.cardPadding * 2 + headerRow.implicitHeight + notificationsConfig.spacing + (modelCount() > 0 ? listHeight : emptyHeight)

    signal closeRequested
    signal clearRequested
    signal dismissRequested(var entry)
    signal actionRequested(var entry, string actionIdentifier)

    // Exclusive keyboard focus only while open, so Esc/keys are delivered the moment the
    // center appears (OnDemand would only grant focus after a click). Released on close.
    WlrLayershell.keyboardFocus: open ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
    onVisibleChanged: if (visible) keyHandler.forceActiveFocus()

    function modelCount() {
        if (!root.centerModel)
            return 0;
        if (typeof root.centerModel.length === "number")
            return root.centerModel.length;
        if (typeof root.centerModel.count === "number")
            return root.centerModel.count;
        return 0;
    }

    visible: open || drawerRect.opacity > 0
    color: "transparent"
    exclusiveZone: -1
    // Full-screen modal overlay above the bar and apps. The backdrop (keyHandler) fills the
    // screen and closes on any outside click; the drawer sits top-right on top of it.
    WlrLayershell.layer: WlrLayer.Overlay

    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }

    MouseArea {
        id: keyHandler
        focus: true
        anchors.fill: parent
        z: -1
        Keys.onEscapePressed: root.closeRequested()
        Keys.onPressed: function (event) {
            // Mod (Super) combos reach us via exclusive focus while the center is open.
            // Mod+B closes (completing the toggle); Mod+Shift+B clears all (and closes).
            if (event.key === Qt.Key_B && (event.modifiers & Qt.MetaModifier)) {
                if (event.modifiers & Qt.ShiftModifier)
                    root.clearRequested();
                else
                    root.closeRequested();
                event.accepted = true;
            }
        }
        onClicked: root.closeRequested()
    }

    Rectangle {
        id: drawerRect
        width: notificationsConfig.drawerWidth
        height: Math.min(root.contentHeight, root.maxPanelHeight)
        x: root.width - width - notificationsConfig.rightMargin
        y: notificationsConfig.topMargin
        color: colors.bg
        border.color: colors.border
        radius: notificationsConfig.cornerRadius
        clip: true
        opacity: open ? notificationsConfig.panelOpacity : 0
        // Popover settle: fade + slight scale from the top-right corner. Avoids the
        // horizontal slide (which depended on root.width and traveled across-screen).
        scale: open ? 1.0 : 0.97
        transformOrigin: Item.TopRight

        Behavior on opacity {
            NumberAnimation { duration: 180; easing.type: open ? Easing.OutCubic : Easing.InCubic }
        }
        Behavior on scale {
            NumberAnimation { duration: 180; easing.type: open ? Easing.OutCubic : Easing.InCubic }
        }

        ColumnLayout {
            id: panelColumn
            anchors.fill: parent
            anchors.margins: notificationsConfig.cardPadding
            spacing: notificationsConfig.spacing

            RowLayout {
                id: headerRow

                Layout.fillWidth: true
                Layout.alignment: Qt.AlignTop

                Text {
                    text: "Notifications"
                    color: colors.fg_float
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: notificationsConfig.headerFontSize
                    font.bold: true
                    Layout.fillWidth: true
                    Layout.alignment: Qt.AlignVCenter
                }

                Text {
                    text: root.modelCount() > 0 ? "󰆳 Clear" : ""
                    visible: text.length > 0
                    color: clearMouse.containsMouse ? colors.red : colors.comment
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: notificationsConfig.headerFontSize
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
                    color: closeMouse.containsMouse ? colors.red : colors.comment
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: notificationsConfig.headerFontSize
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

                visible: root.modelCount() === 0
                text: "No notifications"
                color: colors.comment
                font.family: fontsConfig.defaultFamily
                font.pixelSize: notificationsConfig.bodyFontSize
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
                Layout.alignment: Qt.AlignTop
                Layout.topMargin: 32
            }

            ScrollView {
                visible: root.modelCount() > 0
                Layout.fillWidth: true
                Layout.preferredHeight: root.listHeight
                Layout.maximumHeight: root.maxListHeight
                clip: true

                ListView {
                    id: listView
                    model: centerModel
                    spacing: notificationsConfig.spacing

                    delegate: Item {
                        required property var modelData
                        width: listView.width
                        height: card.implicitHeight

                        NotificationCard {
                            id: card
                            anchors.fill: parent
                            entry: modelData
                            colors: root.colors
                            fontsConfig: root.fontsConfig
                            notificationsConfig: root.notificationsConfig
                            inCenter: true
                            clock: root.clock
                            onDismissRequested: function (entry) {
                                root.dismissRequested(entry);
                            }
                            onActionRequested: function (entry, actionIdentifier) {
                                root.actionRequested(entry, actionIdentifier);
                            }
                        }
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
