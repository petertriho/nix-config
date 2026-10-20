import QtQuick
import Quickshell
import Quickshell.Wayland

// OverlayHost — full-screen surface on the Overlay layer that hosts one popup
// or drawer card:
//   - exclusive keyboard focus while open, so Esc/keys are delivered immediately
//   - an invisible backdrop that closes on Esc or any click outside the card
//   - an input mask without the bar strip, so the bar still gets clicks while
//     the overlay is open. A closing overlay takes no input.
// Each consumer supplies its card as the default child (positioned freely over
// the surface) and drives visibility via `open`; closing is reported back
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
    WlrLayershell.keyboardFocus: root.open ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }

    mask: Region {
        y: Config.bar.height
        width: root.open ? root.width : 0
        height: root.open ? Math.max(0, root.height - Config.bar.height) : 0
    }

    // Keep the surface alive briefly after close so fade-out animations finish.
    visible: root.open || closeGraceTimer.running
    onVisibleChanged: if (visible)
        backdrop.forceActiveFocus()
    onOpenChanged: if (!root.open)
        closeGraceTimer.restart()

    Timer {
        id: closeGraceTimer
        interval: Config.overlay.closeGraceMs
    }

    // Invisible backdrop: Esc or any click outside the card closes.
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

    // Consumer cards render here, above the backdrop (default z 0 > backdrop z -1).
    Item {
        id: layer
        anchors.fill: parent
    }

    default property alias content: layer.data
}
