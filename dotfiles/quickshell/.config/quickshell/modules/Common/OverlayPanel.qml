import QtQuick
import Quickshell
import Quickshell.Wayland

// OverlayPanel — shared full-screen overlay shell used by the stats, codexbar,
// and notification panels. Provides the behavior those three need identically:
//   - transparent full-screen surface above the bar and apps (Overlay layer)
//   - exclusive keyboard focus while open, so Esc/keys are delivered immediately
//   - an invisible backdrop that closes on Esc or any click outside the drawer
// Each consumer supplies its own drawer as the default child (positioned freely
// over the surface) and drives visibility via `open`; closing is reported back
// through `closeRequested`. Panel-specific key shortcuts (e.g. notifications'
// Super+B) hook into `keyPressed`. Set `screen` to place the surface on a
// specific monitor (defaults to the primary screen otherwise).
PanelWindow {
    id: root

    property bool open: false
    signal closeRequested
    signal keyPressed(var event)

    color: "transparent"
    exclusiveZone: -1
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: visible ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }

    // Keep the surface alive briefly after close so fade-out animations finish.
    visible: root.open || closeGraceTimer.running
    onVisibleChanged: if (visible)
        backdrop.forceActiveFocus()
    onOpenChanged: if (!root.open)
        closeGraceTimer.restart()

    Timer {
        id: closeGraceTimer
        interval: 220
    }

    // Invisible backdrop: Esc or any click outside the drawer closes.
    MouseArea {
        id: backdrop
        anchors.fill: parent
        z: -1
        focus: true
        onClicked: root.closeRequested()
        Keys.onPressed: function (event) {
            if (event.key === Qt.Key_Escape) {
                root.closeRequested()
                event.accepted = true
            } else {
                root.keyPressed(event)
            }
        }
    }

    // Consumer drawers render here, above the backdrop (default z 0 > backdrop z -1).
    Item {
        id: layer
        anchors.fill: parent
    }

    default property alias content: layer.data
}
