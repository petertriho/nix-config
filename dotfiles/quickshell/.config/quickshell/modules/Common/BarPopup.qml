pragma ComponentBehavior: Bound

import QtQuick
import Quickshell

// A popup under a bar module. The overlay loads only while the popup is open,
// plus a grace period for the exit animation. The card sits `style.gap` below
// the bar, centered under the module (under the tray when the module is in the
// tray overflow), and keeps `style.gap` from the screen edges.
Scope {
    id: root

    // The module that owns the popup: a BaseModule, or an item with the same
    // `popupKey`, `available`, `visible` and `barWindow` properties.
    required property var module
    property string popupKey: root.module ? root.module.popupKey : ""
    // The item that the card centers under. A module with several targets
    // (the workspace pills) sets the target of the open popup.
    property Item anchorItem: root.module
    // 0 = content implicit width + 2 x padding.
    property real preferredWidth: 0
    default property Component content

    readonly property bool open: root.popupKey !== "" && Popups.active === root.popupKey && root.module.available

    // A popup that cannot show gives up its key. Otherwise it opens again by
    // itself, with the keyboard focus, when the module comes back. Popups
    // handles a screen that goes away.
    Connections {
        target: root.module

        function onAvailableChanged(): void {
            if (!root.module.available && Popups.active === root.popupKey)
                Popups.close();
        }
    }

    // X of an item in its window. It reads the x of every ancestor, so a
    // binding that calls it follows layout changes of the bar.
    function windowX(item: Item): real {
        let x = 0;
        for (let p = item; p; p = p.parent)
            x += p.x;
        return x;
    }

    DeferredLoader {
        open: root.open

        OverlayHost {
            id: host

            readonly property var bar: root.module.barWindow
            readonly property Item anchorItem: !root.module.visible && host.bar && host.bar.overflowAnchor ? host.bar.overflowAnchor : root.anchorItem || root.module
            readonly property real anchorCenter: root.windowX(host.anchorItem) + host.anchorItem.width / 2

            screen: host.bar ? host.bar.screen : null
            open: root.open
            onCloseRequested: {
                if (Popups.active === root.popupKey)
                    Popups.close();
            }

            PopupCard {
                open: host.open
                preferredWidth: root.preferredWidth
                x: Math.max(Config.style.gap, Math.min(host.anchorCenter - width / 2, host.width - width - Config.style.gap))
                y: Config.bar.height + Config.style.gap
                maxHeight: host.height - y - Config.style.gap

                Loader {
                    width: parent.width
                    sourceComponent: root.content
                }
            }
        }
    }
}
