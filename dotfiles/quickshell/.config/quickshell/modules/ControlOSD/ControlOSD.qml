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
        bottom: osdConfig.bottomMargin
    }
    exclusiveZone: -1

    implicitWidth: osdConfig.width
    implicitHeight: osdConfig.height

    // Accept colors from parent
    property QtObject colors: null
    property QtObject osdConfig: null

    property string title: "Volume"
    property real value: 0
    property bool showMute: false
    property bool isMuted: false
    property color progressColor: colors.green

    Rectangle {
        anchors.fill: parent
        color: colors.bg
        radius: osdConfig.cornerRadius
        opacity: osdConfig.opacity

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: osdConfig.contentMargins
            spacing: osdConfig.contentSpacing

            Text {
                text: root.showMute && root.isMuted ? root.title + " (Muted)" : root.title
                color: root.showMute && root.isMuted ? colors.red : colors.fg
                font.pixelSize: osdConfig.titleFontSize
                Layout.alignment: Qt.AlignHCenter
            }

            ProgressBar {
                value: root.value / 100
                Layout.fillWidth: true
                Layout.preferredHeight: osdConfig.progressBarHeight

                background: Rectangle {
                    color: colors.bg_highlight
                    radius: osdConfig.progressBarCornerRadius
                }

                contentItem: Item {
                    Rectangle {
                        color: root.showMute && root.isMuted ? osdConfig.mutedProgressColor : root.progressColor
                        radius: osdConfig.progressFillCornerRadius
                        height: parent.height
                        width: parent.width * (root.value / 100)
                    }
                }
            }

            Text {
                text: Math.round(root.value) + "%"
                color: root.showMute && root.isMuted ? colors.red : colors.fg
                font.pixelSize: osdConfig.valueFontSize
                Layout.alignment: Qt.AlignHCenter
            }
        }
    }

    Timer {
        id: hideTimer
        interval: osdConfig.hideInterval
        onTriggered: root.visible = false
    }

    function show() {
        root.visible = true;
        hideTimer.restart();
    }
}
