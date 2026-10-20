import QtQuick
import Quickshell
import "../Common"

// Toast stack in the top-right corner, newest first.
PanelWindow {
    id: root

    // NotificationService.toastEntries.
    required property var entries

    property real clock
    // Length of the add, remove and displaced transitions.
    readonly property int animationMs: 180

    // Stays mapped until the remove transition of the last toast ends.
    visible: root.entries.length > 0 || hideGrace.running
    color: "transparent"
    exclusiveZone: -1
    implicitWidth: Config.notifications.toastWidth

    // The window spans the screen height, so that a remove transition is not
    // cut off. Only the toasts take input.
    anchors {
        top: true
        right: true
        bottom: true
    }

    margins {
        top: Config.bar.height + Config.style.gap
        right: Config.style.gap
    }

    mask: Region {
        item: toastList
    }

    onEntriesChanged: {
        if (root.entries.length === 0)
            hideGrace.restart();
    }

    Timer {
        id: hideGrace
        interval: root.animationMs + 40
    }

    ListView {
        id: toastList
        width: parent.width
        height: contentHeight
        spacing: Config.notifications.spacing
        interactive: false
        model: ScriptModel {
            values: root.entries
            objectProp: "key"
        }

        delegate: Card {
            id: toast

            required property var modelData
            // Epoch ms at which the toast ends, 0 = when it is dismissed.
            readonly property real toastUntil: toast.entry.toastUntil

            width: toastList.width
            entry: toast.modelData
            clock: root.clock

            // The pointer holds the toast. When it leaves, the toast gets its full time again.
            onHoveredChanged: {
                if (!toast.hovered)
                    NotificationService.restartToast(toast.entry);
            }

            // A new deadline (replacement, hover) restarts the timer, also when
            // the new interval comes out the same as the old one.
            onToastUntilChanged: {
                if (toastTimer.running)
                    toastTimer.restart();
            }

            Timer {
                id: toastTimer
                interval: Math.max(1, toast.toastUntil - Date.now())
                running: toast.toastUntil > 0 && !toast.hovered
                onTriggered: NotificationService.hideToast(toast.entry)
            }
        }

        add: Transition {
            ParallelAnimation {
                NumberAnimation { property: "opacity"; from: 0; to: 1; duration: root.animationMs; easing.type: Easing.OutCubic }
                NumberAnimation { property: "scale"; from: 0.9; to: 1; duration: root.animationMs; easing.type: Easing.OutCubic }
            }
        }

        remove: Transition {
            ParallelAnimation {
                NumberAnimation { property: "opacity"; to: 0; duration: root.animationMs; easing.type: Easing.InCubic }
                NumberAnimation { property: "scale"; to: 0.9; duration: root.animationMs; easing.type: Easing.InCubic }
            }
        }

        // A replaced notification moves to the top.
        move: Transition {
            NumberAnimation { property: "y"; duration: root.animationMs; easing.type: Easing.OutCubic }
        }

        // Also completes an add transition that a second change interrupted.
        displaced: Transition {
            NumberAnimation { property: "y"; duration: root.animationMs; easing.type: Easing.OutCubic }
            NumberAnimation { properties: "opacity,scale"; to: 1; duration: root.animationMs; easing.type: Easing.OutCubic }
        }
    }

    Timer {
        interval: 60000
        repeat: true
        running: root.visible
        triggeredOnStart: true
        onTriggered: root.clock = Date.now()
    }
}
