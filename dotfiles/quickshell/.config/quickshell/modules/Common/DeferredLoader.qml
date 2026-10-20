import QtQuick
import Quickshell

// Load overlay content only while it is open. Keep it alive briefly after
// close so the consumer's exit animation can finish before objects are freed.
LazyLoader {
    id: root

    property bool open: false
    property int unloadDelay: Config.overlay.closeGraceMs + 20
    readonly property Timer unloadTimer: Timer {
        interval: root.unloadDelay
    }

    active: root.open || root.unloadTimer.running

    onOpenChanged: {
        if (root.open)
            root.unloadTimer.stop();
        else if (root.active)
            root.unloadTimer.restart();
    }
}
