pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import ".."
import "../../Common"
import "." as Local

BaseModule {
    id: root
    hoverHighlight: true
    popupId: "clock"

    // Minute precision, without per-second wakeups. The calendar reads it for "today".
    readonly property date now: sysClock.date

    text: Qt.formatDateTime(root.now, "yyyy-MM-dd HH:mm")

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
