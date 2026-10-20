pragma Singleton

import QtQuick
import Quickshell

// Open state of every popup and drawer. One is open at a time, across all
// screens. Bar popup keys are "<screen name>:<id>" (id: clock, battery,
// bluetooth, caffeine, stats, tray). The drawers use "notifications" and
// "codexbar".
Singleton {
    id: root

    // Key of the open popup or drawer. Empty when nothing is open.
    property string active: ""

    function toggle(key: string): void {
        root.active = root.active === key ? "" : key;
    }

    function open(key: string): void {
        root.active = key;
    }

    // Closes every popup and drawer.
    function close(): void {
        root.active = "";
    }

    // A bar popup whose screen is gone gives up its key. Otherwise it opens
    // again by itself, with the keyboard focus, when the screen comes back.
    Connections {
        target: Quickshell

        function onScreensChanged(): void {
            const separator = root.active.indexOf(":");
            if (separator > 0 && !Quickshell.screens.some(screen => screen.name === root.active.slice(0, separator)))
                root.close();
        }
    }
}
