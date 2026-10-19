import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import ".."
import "../../Common" as Common
import "../../ControlOSD" as Osd
import "." as Local

BaseModule {
    id: root
    hoverHighlight: true
    property QtObject popupsConfig: parent.popupsConfig
    property QtObject overlayConfig: parent.overlayConfig
    property var barWindow: null
    property var osdService: null

    // Minute-precision label without per-second wakeups.
    text: Qt.formatDateTime(sysClock.date, "yyyy-MM-dd HH:mm")

    // The mini OSD covers the clock text in place. The text stays set, so the
    // implicit width (and `clock.x` in the bar layout) does not change. The text
    // fades through its color alpha, not opacity, because the mini OSD is a
    // child of the text item.
    readonly property bool osdShown: osdService ? osdService.shown : false
    readonly property int fadeMs: overlayConfig ? overlayConfig.animationDurationMs : 90
    readonly property color clockColor: colors.base05
    property real clockAlpha: osdShown ? 0 : 1
    Behavior on clockAlpha {
        NumberAnimation {
            duration: root.fadeMs
        }
    }
    textColor: Qt.rgba(clockColor.r, clockColor.g, clockColor.b, clockAlpha)

    Osd.MiniOsd {
        anchors.fill: parent
        osdService: root.osdService
        colors: root.colors
        fontsConfig: root.fontsConfig
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
                var direction = root.wheelRemainder > 0 ? 1 : -1;
                root.osdService.step(direction);
                root.wheelRemainder -= direction * 120;
            }
        }
    }

    // Calendar popup state
    property bool showPopup: false
    readonly property real globalX: popupAnchor.globalX

    // Month currently in view (0-indexed month)
    property int viewYear: new Date().getFullYear()
    property int viewMonth: new Date().getMonth()
    property bool weekStartsOnMonday: true

    readonly property var _today: new Date()
    readonly property int _todayYear: _today.getFullYear()
    readonly property int _todayMonth: _today.getMonth()
    readonly property int _todayDay: _today.getDate()

    readonly property var _monthNames: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

    readonly property string monthLabel: _monthNames[viewMonth] + " " + viewYear

    readonly property var weekdayLabels: weekStartsOnMonday ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

    readonly property var cellModel: {
        var cells = [];
        var firstOfMonth = new Date(viewYear, viewMonth, 1);
        var startWeekday = firstOfMonth.getDay(); // 0 = Sunday
        var lead = weekStartsOnMonday ? (startWeekday + 6) % 7 : startWeekday;
        var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        var daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

        for (var i = 0; i < 42; i++) {
            var dayNum;
            var inMonth = true;
            if (i < lead) {
                dayNum = daysInPrevMonth - lead + 1 + i;
                inMonth = false;
            } else if (i >= lead + daysInMonth) {
                dayNum = i - lead - daysInMonth + 1;
                inMonth = false;
            } else {
                dayNum = i - lead + 1;
            }
            var isToday = inMonth && viewYear === _todayYear && viewMonth === _todayMonth && dayNum === _todayDay;
            cells.push({
                "day": dayNum,
                "inMonth": inMonth,
                "isToday": isToday
            });
        }
        return cells;
    }

    SystemClock {
        id: sysClock
        enabled: true
        precision: SystemClock.Minutes
    }

    function popupX(popupWidth) {
        return popupAnchor.popupX(popupWidth);
    }

    function closePopup() {
        root.showPopup = false;
    }

    Common.DeferredLoader {
        open: root.showPopup
        unloadDelay: root.overlayConfig ? root.overlayConfig.closeGraceMs + 20 : 250

        Local.Popup {
            module: root
            barWindow: root.barWindow
            colors: root.colors
            fontsConfig: root.fontsConfig
            popupsConfig: root.popupsConfig
            overlayConfig: root.overlayConfig
        }
    }

    PopupAnchor {
        id: popupAnchor
        module: root
        barWindow: root.barWindow
    }

    function goPrevMonth() {
        if (root.viewMonth === 0) {
            root.viewMonth = 11;
            root.viewYear -= 1;
        } else {
            root.viewMonth -= 1;
        }
    }

    function goNextMonth() {
        if (root.viewMonth === 11) {
            root.viewMonth = 0;
            root.viewYear += 1;
        } else {
            root.viewMonth += 1;
        }
    }

    function goToday() {
        root.viewYear = root._todayYear;
        root.viewMonth = root._todayMonth;
    }

    onClicked: {
        popupAnchor.updatePosition();
        showPopup = !showPopup;
    }

    onXChanged: popupAnchor.updatePosition()
    onWidthChanged: popupAnchor.updatePosition()
}
