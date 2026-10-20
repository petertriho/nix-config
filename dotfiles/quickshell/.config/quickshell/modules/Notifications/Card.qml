import QtQuick
import QtQuick.Layouts
import Quickshell.Widgets
import "../Common"

// One notification: a toast, or a card nested in the notification center.
// `entry` is a NotificationService snapshot. The clicks go to the service.
Rectangle {
    id: root

    required property var entry

    property bool inCenter: false
    property real clock
    readonly property bool hovered: hoverHandler.hovered
    readonly property bool clickable: root.entry.hasDefaultAction || root.entry.canOpenApp

    implicitHeight: cardColumn.implicitHeight + Config.style.padding * 2
    color: root.inCenter ? Config.style.cardColor : Config.style.surfaceColor
    radius: root.inCenter ? Config.style.radiusSmall : Config.style.radius
    // A center card sits on the drawer surface and needs no border unless it is critical.
    border.width: root.inCenter && !root.entry.critical ? 0 : 1
    border.color: root.entry.critical ? Config.colors.base08 : Config.style.borderColor
    clip: true

    HoverHandler {
        id: hoverHandler
    }

    MouseArea {
        anchors.fill: parent
        z: -1
        cursorShape: root.clickable ? Qt.PointingHandCursor : Qt.ArrowCursor
        onClicked: NotificationService.activate(root.entry)
    }

    function relativeTime(createdAtMs, nowMs) {
        if (!createdAtMs)
            return "";
        const minutes = Math.floor(Math.max(0, nowMs - createdAtMs) / 60000);
        if (minutes < 1)
            return "now";
        if (minutes < 60)
            return minutes + "m";
        const hours = Math.floor(minutes / 60);
        if (hours < 24)
            return hours + "h";
        return Math.floor(hours / 24) + "d";
    }

    ColumnLayout {
        id: cardColumn
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: Config.style.padding
        spacing: 8

        RowLayout {
            Layout.fillWidth: true
            spacing: 10

            // Hidden until it loads, so a missing icon leaves no gap.
            IconImage {
                id: icon
                visible: icon.status === Image.Ready
                source: root.entry.iconSource
                implicitSize: Config.notifications.iconSize
                Layout.alignment: Qt.AlignTop
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 3

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 6

                    Text {
                        text: root.entry.appName || "Notification"
                        color: root.entry.critical ? Config.colors.base08 : Config.style.accentColor
                        font.family: Config.fonts.defaultFamily
                        font.pixelSize: Config.notifications.appFontSize
                        font.bold: root.entry.critical
                        elide: Text.ElideRight
                        Layout.fillWidth: true
                    }

                    Text {
                        text: root.relativeTime(root.entry.createdAt, root.clock)
                        color: Config.colors.base03
                        font.family: Config.fonts.defaultFamily
                        font.pixelSize: Config.notifications.appFontSize
                        Layout.alignment: Qt.AlignVCenter
                    }
                }

                Text {
                    text: root.entry.summary
                    visible: text.length > 0
                    color: Config.colors.base06
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.notifications.summaryFontSize
                    font.bold: true
                    wrapMode: Text.WordWrap
                    maximumLineCount: 2
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }

                Text {
                    text: root.entry.body
                    visible: text.length > 0
                    color: Config.colors.base05
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.notifications.bodyFontSize
                    wrapMode: Text.WordWrap
                    maximumLineCount: root.inCenter ? Config.notifications.centerBodyLines : Config.notifications.toastBodyLines
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }

            Text {
                text: "󰅖"
                color: closeMouse.containsMouse ? Config.colors.base08 : Config.colors.base03
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.notifications.summaryFontSize
                Layout.alignment: Qt.AlignTop

                MouseArea {
                    id: closeMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: NotificationService.dismiss(root.entry)
                }
            }
        }

        Flow {
            visible: root.entry.actions.length > 0
            Layout.fillWidth: true
            spacing: 6

            Repeater {
                model: root.entry.actions

                delegate: Rectangle {
                    id: actionButton

                    required property var modelData

                    height: actionText.implicitHeight + 8
                    width: actionText.implicitWidth + 16
                    color: actionMouse.containsMouse ? Config.style.hoverColor : Config.colors.base11
                    border.color: Config.colors.base0C
                    radius: Config.style.radiusSmall

                    Text {
                        id: actionText
                        anchors.centerIn: parent
                        text: actionButton.modelData.text
                        color: Config.colors.base05
                        font.family: Config.fonts.defaultFamily
                        font.pixelSize: Config.notifications.actionFontSize
                    }

                    MouseArea {
                        id: actionMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: NotificationService.invokeAction(root.entry, actionButton.modelData.identifier)
                    }
                }
            }
        }
    }
}
