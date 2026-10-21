pragma ComponentBehavior: Bound

import QtQuick
import ".."
import "../../Common"
import "../workspaces"
import "." as Local

// Title of the active window on the output. On niri, a left click toggles the
// overview, the wheel moves the column focus when this output has the focus,
// and a right click opens the window menu.
BaseModule {
    id: root

    property string outputName: ""
    readonly property string title: WorkspaceService.activeWindowTitleForOutput(root.outputName)
    // Null on Hyprland, where the title takes no input.
    readonly property var window: WorkspaceService.activeWindowForOutput(root.outputName)
    readonly property int windowId: root.window ? root.window.id : -1
    // One column per wheel notch (120 units). Touchpad deltas accumulate
    // until they reach a notch.
    property real wheelRemainder: 0

    text: root.title
    textColor: Config.colors.base05
    visible: root.title.length > 0 && root.width > Config.module.widthPadding
    clip: true
    horizontalAlignment: Text.AlignLeft
    elide: Text.ElideRight

    hoverHighlight: !!root.window
    popupId: "window"
    popupOnClick: false
    managesPopups: true

    // The menu acts on the window that it opened for.
    onWindowIdChanged: {
        if (root.popupOpen)
            Popups.close();
    }

    BarPopup {
        module: root
        preferredWidth: 300

        Local.Popup {
            module: root
        }
    }

    // Up and left focus the column to the left, as in a scroll area. Only on
    // the focused output: niri moves the pointer to the center of an output
    // that gets the focus from an action. A click on the bar focuses its
    // output and keeps the pointer in place.
    WheelHandler {
        enabled: !!root.window && root.outputName === WorkspaceService.focusedOutput
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
        onEnabledChanged: root.wheelRemainder = 0
        onWheel: function (event) {
            const delta = event.angleDelta;
            root.wheelRemainder += Math.abs(delta.x) > Math.abs(delta.y) ? delta.x : delta.y;
            while (Math.abs(root.wheelRemainder) >= 120) {
                const direction = root.wheelRemainder > 0 ? -1 : 1;
                WorkspaceService.focusColumn(direction);
                root.wheelRemainder += direction * 120;
            }
        }
    }

    // A click with the menu open only closes the menu.
    onClicked: {
        const menuOpen = root.popupOpen;
        Popups.close();
        if (!menuOpen)
            WorkspaceService.toggleOverview();
    }

    onRightClicked: {
        if (root.window)
            Popups.toggle(root.popupKey);
    }
}
