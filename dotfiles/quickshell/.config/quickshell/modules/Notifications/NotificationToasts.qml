import QtQuick
import Quickshell

PanelWindow {
    id: root

    required property var toastModel
    required property QtObject colors
    required property QtObject fontsConfig
    required property QtObject notificationsConfig

    readonly property int resolvedToastWidth: notificationsConfig ? notificationsConfig.toastWidth : 360
    readonly property int resolvedTopMargin: notificationsConfig ? notificationsConfig.topMargin : 36
    readonly property int resolvedRightMargin: notificationsConfig ? notificationsConfig.rightMargin : 12
    readonly property int resolvedToastTimeoutMs: notificationsConfig ? notificationsConfig.toastTimeoutMs : 6000
    readonly property int resolvedSpacing: notificationsConfig ? notificationsConfig.spacing : 8

    signal hideToastRequested(var entry)
    signal dismissRequested(var entry)
    signal actionRequested(var entry, string actionIdentifier)

    visible: modelCount() > 0
    color: "transparent"
    exclusiveZone: -1
    implicitWidth: resolvedToastWidth
    implicitHeight: toastColumn.implicitHeight

    anchors {
        top: true
        right: true
    }

    margins {
        top: resolvedTopMargin
        right: resolvedRightMargin
    }

    function modelCount() {
        if (!root.toastModel)
            return 0;
        if (typeof root.toastModel.length === "number")
            return root.toastModel.length;
        if (typeof root.toastModel.count === "number")
            return root.toastModel.count;
        return 0;
    }

    Column {
        id: toastColumn
        width: resolvedToastWidth
        spacing: resolvedSpacing

        Repeater {
            model: toastModel

            delegate: Item {
                required property var modelData
                width: resolvedToastWidth
                height: card.implicitHeight

                NotificationCard {
                    id: card
                    anchors.fill: parent
                    entry: modelData
                    colors: root.colors
                    fontsConfig: root.fontsConfig
                    notificationsConfig: root.notificationsConfig
                    inCenter: false
                    onDismissRequested: function(entry) { root.dismissRequested(entry); }
                    onActionRequested: function(entry, actionIdentifier) { root.actionRequested(entry, actionIdentifier); }
                }
            }
        }
    }

    Timer {
        interval: 1000
        running: modelCount() > 0
        repeat: true
        onTriggered: {
            const now = Date.now();
            const toasts = root.toastModel;
            for (let i = 0; i < toasts.length; ++i) {
                const entry = toasts[i];
                if (entry.hideAt && entry.hideAt > 0 && now >= entry.hideAt) {
                    root.hideToastRequested(entry);
                }
            }
        }
    }
}
