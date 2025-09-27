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
        bottom: 50
    }
    exclusiveZone: -1

    implicitWidth: 300
    implicitHeight: 100

    property string title: "Volume"
    property real value: 0
    property color progressColor: Colors.colors.green
    property bool showMute: false
    property bool isMuted: false

    Rectangle {
        anchors.fill: parent
        color: Colors.colors.bg
        radius: 10
        opacity: 0.9

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 20
            spacing: 10

            Text {
                text: root.showMute && root.isMuted ? root.title + " (Muted)" : root.title
                color: root.showMute && root.isMuted ? Colors.colors.red : Colors.colors.fg
                font.pixelSize: 16
                Layout.alignment: Qt.AlignHCenter
            }

            ProgressBar {
                value: root.value / 100
                Layout.fillWidth: true
                Layout.preferredHeight: 20

                background: Rectangle {
                    color: Colors.colors.bg_highlight
                    radius: 5
                }

                contentItem: Item {
                    Rectangle {
                        color: root.showMute && root.isMuted ? "#f38ba8" : root.progressColor
                        radius: 5
                        height: parent.height
                        width: parent.width * (root.value / 100)
                    }
                }
            }

            Text {
                text: Math.round(root.value) + "%"
                color: root.showMute && root.isMuted ? Colors.colors.red : Colors.colors.fg
                font.pixelSize: 14
                Layout.alignment: Qt.AlignHCenter
            }
        }
    }

    Timer {
        id: hideTimer
        interval: 2000
        onTriggered: root.visible = false
    }

    function show() {
        root.visible = true;
        hideTimer.restart();
    }
}