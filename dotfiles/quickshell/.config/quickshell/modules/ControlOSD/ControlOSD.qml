import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell

PanelWindow {
    id: root
    visible: false
    color: "transparent"
    anchors {
        bottom: true
    }
    margins {
        bottom: config ? config.osd.bottomMargin : 50
    }
    exclusiveZone: -1

    implicitWidth: config ? config.osd.width : 300
    implicitHeight: config ? config.osd.height : 100

    // Accept colors from parent
    property QtObject colors: null
    property QtObject config: null

    property string title: "Volume"
    property real value: 0
    property bool showMute: false
    property bool isMuted: false
    property color progressColor: colors.green

    Rectangle {
        anchors.fill: parent
        color: colors ? colors.bg : "#16161e"
        radius: config ? config.osd.cornerRadius : 10
        opacity: config ? config.osd.opacity : 0.9

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: config ? config.osd.contentMargins : 20
            spacing: config ? config.osd.contentSpacing : 10

            Text {
                text: root.showMute && root.isMuted ? root.title + " (Muted)" : root.title
                color: root.showMute && root.isMuted ? (colors ? colors.red : "#f7768e") : (colors ? colors.fg : "#a9b1d6")
                font.pixelSize: config ? config.osd.titleFontSize : 16
                Layout.alignment: Qt.AlignHCenter
            }

            ProgressBar {
                value: root.value / 100
                Layout.fillWidth: true
                Layout.preferredHeight: config ? config.osd.progressBarHeight : 20

                background: Rectangle {
                    color: colors ? colors.bg_highlight : "#292e42"
                    radius: config ? config.osd.progressBarCornerRadius : 5
                }

                contentItem: Item {
                    Rectangle {
                        color: root.showMute && root.isMuted ? (config ? config.osd.mutedProgressColor : "#f38ba8") : (colors ? colors.green : "#9ece6a")
                        radius: config ? config.osd.progressFillCornerRadius : 5
                        height: parent.height
                        width: parent.width * (root.value / 100)
                    }
                }
            }

            Text {
                text: Math.round(root.value) + "%"
                color: root.showMute && root.isMuted ? (colors ? colors.red : "#f7768e") : (colors ? colors.fg : "#a9b1d6")
                font.pixelSize: config ? config.osd.valueFontSize : 14
                Layout.alignment: Qt.AlignHCenter
            }
        }
    }

    Timer {
        id: hideTimer
        interval: config ? config.osd.hideInterval : 2000
        onTriggered: root.visible = false
    }

    function show() {
        root.visible = true;
        hideTimer.restart();
    }
}
