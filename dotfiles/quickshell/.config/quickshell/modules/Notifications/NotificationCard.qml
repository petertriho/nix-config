import QtQuick
import QtQuick.Layouts
import Quickshell.Widgets

Rectangle {
    id: root

    required property var entry
    required property QtObject colors
    required property QtObject fontsConfig
    required property QtObject notificationsConfig

    property bool inCenter: false

    signal dismissRequested(var entry)
    signal actionRequested(var entry, string actionIdentifier)

    width: inCenter && parent ? parent.width : notificationsConfig.toastWidth
    implicitHeight: cardColumn.implicitHeight + notificationsConfig.cardPadding * 2
    color: colors.bg
    border.color: colors.border
    radius: notificationsConfig.cornerRadius
    clip: true
    opacity: notificationsConfig.panelOpacity

    function appName() {
        if (entry && entry.appName && entry.appName.length > 0)
            return entry.appName;
        return "Notification";
    }

    function summary() {
        return entry && entry.summary ? entry.summary : "";
    }

    function body() {
        return entry && entry.body ? entry.body : "";
    }

    function iconSource() {
        if (!entry)
            return "";
        if (entry.image && entry.image.length > 0)
            return entry.image;
        if (entry.appIcon && entry.appIcon.length > 0)
            return entry.appIcon;
        return "";
    }

    function actions() {
        return entry && entry.actions ? entry.actions : [];
    }

    ColumnLayout {
        id: cardColumn
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: notificationsConfig.cardPadding
        spacing: 8

        RowLayout {
            Layout.fillWidth: true
            spacing: 10

            IconImage {
                visible: root.iconSource().length > 0
                source: root.iconSource()
                implicitSize: notificationsConfig.iconSize
                Layout.alignment: Qt.AlignTop
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 3

                Text {
                    text: root.appName()
                    color: colors.blue
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: notificationsConfig.appFontSize
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }

                Text {
                    text: root.summary()
                    visible: text.length > 0
                    color: colors.fg_float
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: notificationsConfig.summaryFontSize
                    font.bold: true
                    wrapMode: Text.WordWrap
                    maximumLineCount: 2
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }

                Text {
                    text: root.body()
                    visible: text.length > 0
                    color: colors.fg
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: notificationsConfig.bodyFontSize
                    wrapMode: Text.WordWrap
                    maximumLineCount: root.inCenter ? notificationsConfig.centerBodyLines : notificationsConfig.toastBodyLines
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }

            Text {
                text: "󰅖"
                color: closeMouse.containsMouse ? colors.red : colors.comment
                font.family: fontsConfig.defaultFamily
                font.pixelSize: notificationsConfig.summaryFontSize
                Layout.alignment: Qt.AlignTop

                MouseArea {
                    id: closeMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: root.dismissRequested(root.entry)
                }
            }
        }

        Flow {
            visible: root.actions().length > 0
            Layout.fillWidth: true
            spacing: 6

            Repeater {
                model: root.actions()

                delegate: Rectangle {
                    height: actionText.implicitHeight + 8
                    width: actionText.implicitWidth + 16
                    color: actionMouse.containsMouse ? colors.bg_highlight : colors.bg_dark1
                    border.color: colors.border_highlight
                    radius: 6

                    Text {
                        id: actionText
                        anchors.centerIn: parent
                        text: modelData.text
                        color: colors.fg
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: notificationsConfig.actionFontSize
                    }

                    MouseArea {
                        id: actionMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: root.actionRequested(root.entry, modelData.identifier)
                    }
                }
            }
        }
    }
}
