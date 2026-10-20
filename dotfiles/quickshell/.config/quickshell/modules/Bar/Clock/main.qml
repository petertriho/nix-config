pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import ".."
import "../../Common"
import "../../ControlOSD" as Osd
import "." as Local

BaseModule {
    id: root
    hoverHighlight: true
    popupId: "clock"

    // Minute precision, without per-second wakeups. The calendar reads it for "today".
    readonly property date now: sysClock.date

    text: Qt.formatDateTime(root.now, "yyyy-MM-dd HH:mm")

    // The mini OSD covers the clock text in place. The text stays set, so the
    // implicit width (and `clock.x` in the bar layout) does not change. The text
    // fades through its color alpha, not opacity, because the mini OSD is a
    // child of the text item.
    readonly property bool osdShown: Osd.OsdService.shown
    readonly property int fadeMs: Config.overlay.animationDurationMs
    readonly property color clockColor: Config.colors.base05
    property real clockAlpha: osdShown ? 0 : 1
    Behavior on clockAlpha {
        NumberAnimation {
            duration: root.fadeMs
        }
    }
    textColor: Qt.rgba(clockColor.r, clockColor.g, clockColor.b, clockAlpha)

    Osd.MiniOsd {
        anchors.fill: parent
        opacity: root.osdShown ? 1 : 0
        visible: opacity > 0
        Behavior on opacity {
            NumberAnimation {
                duration: root.fadeMs
            }
        }
    }

    // One step per wheel notch (120 units). Touchpad deltas accumulate until
    // they reach a notch.
    property real wheelRemainder: 0
    onOsdShownChanged: wheelRemainder = 0

    WheelHandler {
        enabled: root.osdShown
        target: null
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
        onWheel: function (event) {
            root.wheelRemainder += event.angleDelta.y;
            while (Math.abs(root.wheelRemainder) >= 120) {
                const direction = root.wheelRemainder > 0 ? 1 : -1;
                Osd.OsdService.step(direction);
                root.wheelRemainder -= direction * 120;
            }
        }
    }

    SystemClock {
        id: sysClock
        enabled: true
        precision: SystemClock.Minutes
    }

    BarPopup {
        module: root

        Local.Popup {
            module: root
        }
    }
}
