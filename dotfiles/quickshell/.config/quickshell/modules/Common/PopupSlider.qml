import QtQuick
import QtQuick.Layouts

// A level line of a popup: an icon, a track with a fill, and the percent. A
// press or a drag on the track emits `moved` with the new percent. A click on
// the icon emits `iconClicked` (for example, to mute). The wheel steps by
// `step`. The parent sets the width.
Item {
    id: root

    // Percent. Another tool can set a volume above 100, so the fill clamps.
    property real value: 0
    property string icon: ""
    property color fillColor: Config.colors.base0B
    property bool muted: false
    property int step: 5

    // The track shows the pointer position while a drag runs, so that a slow
    // backend does not make the fill jump.
    property bool dragging: false
    property real dragValue: 0
    readonly property real shownValue: root.dragging ? root.dragValue : root.value
    readonly property color textColor: root.muted ? Config.colors.base08 : Config.colors.base05

    // One step per wheel notch (120 units). Touchpad deltas accumulate until
    // they reach a notch.
    property real wheelRemainder: 0

    signal moved(real value)
    signal iconClicked

    implicitWidth: 200
    implicitHeight: Math.max(iconText.implicitHeight, percentText.implicitHeight) + 4

    function valueAt(x: real): real {
        return Math.round(Math.max(0, Math.min(100, x / track.width * 100)));
    }

    RowLayout {
        anchors.fill: parent
        spacing: 8

        Rectangle {
            Layout.preferredWidth: iconText.implicitWidth + 8
            Layout.fillHeight: true
            radius: Config.style.radiusSmall
            color: iconMouse.containsMouse ? Config.style.hoverColor : "transparent"

            Text {
                id: iconText
                anchors.centerIn: parent
                text: root.icon
                color: root.textColor
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize
            }

            MouseArea {
                id: iconMouse
                anchors.fill: parent
                hoverEnabled: true
                onClicked: root.iconClicked()
            }
        }

        Item {
            Layout.fillWidth: true
            Layout.fillHeight: true

            Rectangle {
                id: track
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                height: Config.osd.progressBarHeight
                radius: Config.osd.progressBarCornerRadius
                color: Config.colors.base02

                Rectangle {
                    height: parent.height
                    width: parent.width * Math.max(0, Math.min(1, root.shownValue / 100))
                    radius: parent.radius
                    color: root.muted ? Config.colors.base12 : root.fillColor
                }
            }

            // The full row height takes the presses, so that the thin track is
            // easy to hit. It keeps a drag from the popup Flickable.
            MouseArea {
                anchors.fill: parent
                preventStealing: true
                cursorShape: Qt.PointingHandCursor
                onPressed: function (mouse) {
                    root.dragValue = root.valueAt(mouse.x);
                    root.dragging = true;
                    root.moved(root.dragValue);
                }
                onPositionChanged: function (mouse) {
                    const value = root.valueAt(mouse.x);
                    if (value === root.dragValue)
                        return;
                    root.dragValue = value;
                    root.moved(value);
                }
                onReleased: root.dragging = false
                onCanceled: root.dragging = false
            }
        }

        Text {
            id: percentText
            Layout.preferredWidth: percentMetrics.advanceWidth
            text: Math.round(root.shownValue) + "%"
            color: root.textColor
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize
            horizontalAlignment: Text.AlignRight
        }
    }

    TextMetrics {
        id: percentMetrics
        font: percentText.font
        text: "100%"
    }

    // A value above 100 does not step up, and steps down from where it is.
    WheelHandler {
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
        onWheel: function (event) {
            root.wheelRemainder += event.angleDelta.y;
            while (Math.abs(root.wheelRemainder) >= 120) {
                const direction = root.wheelRemainder > 0 ? 1 : -1;
                const top = Math.max(100, Math.round(root.value));
                root.moved(Math.max(0, Math.min(top, Math.round(root.value) + direction * root.step)));
                root.wheelRemainder -= direction * 120;
            }
        }
    }
}
