import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell

PanelWindow {
    id: root

    required property var centerModel
    required property QtObject colors
    required property QtObject fontsConfig
    required property QtObject notificationsConfig

    property bool open: false

    signal closeRequested
    signal clearRequested
    signal dismissRequested(var entry)
    signal actionRequested(var entry, string actionIdentifier)

    function modelCount() {
        if (!root.centerModel)
            return 0;
        if (typeof root.centerModel.length === "number")
            return root.centerModel.length;
        if (typeof root.centerModel.count === "number")
            return root.centerModel.count;
        return 0;
    }

    visible: open
    color: "transparent"
    exclusiveZone: -1
    implicitWidth: notificationsConfig.drawerWidth
    implicitHeight: panelColumn.implicitHeight

    anchors {
        top: true
        right: true
        bottom: true
    }

    margins {
        top: notificationsConfig.topMargin
        right: notificationsConfig.rightMargin
        bottom: notificationsConfig.bottomMargin
    }

    Rectangle {
        anchors.fill: parent
        color: colors.bg
        border.color: colors.border
        radius: notificationsConfig.cornerRadius
        clip: true
        opacity: notificationsConfig.panelOpacity

        ColumnLayout {
            id: panelColumn
            anchors.fill: parent
            anchors.margins: notificationsConfig.cardPadding
            spacing: notificationsConfig.spacing

            RowLayout {
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
                    text: root.modelCount() > 0 ? "Clear" : ""
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
                Layout.fillHeight: true
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
                            onDismissRequested: function(entry) { root.dismissRequested(entry); }
                            onActionRequested: function(entry, actionIdentifier) { root.actionRequested(entry, actionIdentifier); }
                        }
                    }
                }
            }
        }
    }
}
