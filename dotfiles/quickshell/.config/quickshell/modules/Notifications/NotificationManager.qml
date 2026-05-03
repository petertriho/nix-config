import QtQuick
import Quickshell.Services.Notifications

Item {
    id: root

    required property QtObject colors
    required property QtObject fontsConfig
    required property QtObject notificationsConfig

    property var notifications: []
    property var notificationMap: ({})
    property bool centerVisible: false

    readonly property var persistentNotifications: notifications.filter(function(entry) {
        return !entry.transient;
    })
    readonly property int notificationCount: persistentNotifications.length
    readonly property var visibleToasts: notifications.filter(function(entry) {
        return entry.toastVisible;
    }).slice(0, notificationsConfig.maxToasts)

    function toggleCenter() {
        centerVisible = !centerVisible;
    }

    function showCenter() {
        centerVisible = true;
    }

    function hideCenter() {
        centerVisible = false;
    }

    function addNotification(notification) {
        const next = notifications.slice();
        const appName = notification.appName || "";
        const existingIndex = next.findIndex(function(entry) {
            return entry.appName === appName && entry.notificationId === notification.id;
        });
        const key = appName + ":" + notification.id + ":" + Date.now();

        if (existingIndex >= 0) {
            const oldEntry = next[existingIndex];
            const oldNotification = notificationMap[oldEntry.key];
            // Delete from map first to prevent closed signal from re-entering
            delete notificationMap[oldEntry.key];
            next.splice(existingIndex, 1);
            if (oldNotification && oldNotification !== notification)
                oldNotification.tracked = false;
        }

        notification.closed.connect(function() {
            root.removeEntryByKey(key, false);
        });

        notificationMap[key] = notification;

        let timeoutMs = notificationsConfig.toastTimeoutMs;
        const et = notification.expireTimeout;
        if (et === 0) timeoutMs = -1; // never expire
        else if (et > 0) timeoutMs = et;

        next.unshift({
            key: key,
            notificationId: notification.id,
            appName: appName,
            summary: notification.summary || "",
            body: notification.body || "",
            appIcon: notification.appIcon || "",
            image: notification.image || "",
            actions: notification.actions ? notification.actions.map(function(a) {
                return {identifier: a.identifier, text: a.text};
            }) : [],
            transient: notification.transient,
            resident: notification.resident,
            toastVisible: true,
            hideAt: timeoutMs < 0 ? 0 : Date.now() + timeoutMs,
            createdAt: Date.now()
        });

        while (next.length > notificationsConfig.maxHistory) {
            const dropped = next.pop();
            const droppedNotification = notificationMap[dropped.key];
            if (droppedNotification) {
                delete notificationMap[dropped.key];
                droppedNotification.tracked = false;
            }
        }

        notifications = next;
    }

    function updateEntry(entry, mutator) {
        const next = notifications.slice();
        const index = next.findIndex(function(candidate) {
            return candidate.key === entry.key;
        });

        if (index < 0)
            return;

        const copy = Object.assign({}, next[index]);
        mutator(copy);
        next[index] = copy;
        notifications = next;
    }

    function hideToast(entry) {
        if (entry.transient) {
            const notification = notificationMap[entry.key];
            if (notification && notification.expire)
                notification.expire();
            removeEntryByKey(entry.key, false);
            return;
        }

        updateEntry(entry, function(copy) {
            copy.toastVisible = false;
        });
    }

    function removeEntry(entry, closeRemote) {
        removeEntryByKey(entry.key, closeRemote);
    }

    function removeEntryByKey(key, closeRemote) {
        // Guard against double-remove and infinite recursion from closed signal
        if (!notificationMap[key]) return;
        if (!notifications.some(function(c) { return c.key === key; })) return;

        const next = notifications.filter(function(candidate) {
            return candidate.key !== key;
        });

        const notification = notificationMap[key];
        // Delete from map FIRST before calling dismiss() to prevent
        // the closed signal handler from re-entering recursively.
        delete notificationMap[key];

        if (closeRemote && notification)
            notification.dismiss();

        notifications = next;
    }

    function clearAll() {
        notifications.forEach(function(entry) {
            const notification = notificationMap[entry.key];
            if (notification)
                notification.dismiss();
        });
        notificationMap = {};
        notifications = [];
    }

    function invokeAction(entry, actionIdentifier) {
        const notification = notificationMap[entry.key];
        if (!notification) {
            removeEntryByKey(entry.key, false);
            return;
        }
        const action = notification.actions.find(function(a) {
            return a.identifier === actionIdentifier;
        });
        if (action) {
            action.invoke();
            if (!notification.resident)
                removeEntryByKey(entry.key, false);
        }
    }

    NotificationServer {
        id: notificationServer
        actionsSupported: true
        imageSupported: true
        bodySupported: true
        persistenceSupported: true
        keepOnReload: true

        onNotification: function(notification) {
            notification.tracked = true;
            root.addNotification(notification);
        }
    }

    NotificationToasts {
        toastModel: root.visibleToasts
        colors: root.colors
        fontsConfig: root.fontsConfig
        notificationsConfig: root.notificationsConfig
        onHideToastRequested: function(entry) { root.hideToast(entry); }
        onDismissRequested: function(entry) { root.removeEntry(entry, true); }
        onActionRequested: function(entry, actionIdentifier) { root.invokeAction(entry, actionIdentifier); }
    }

    NotificationCenter {
        open: root.centerVisible
        centerModel: root.persistentNotifications
        colors: root.colors
        fontsConfig: root.fontsConfig
        notificationsConfig: root.notificationsConfig
        onCloseRequested: root.hideCenter()
        onClearRequested: root.clearAll()
        onDismissRequested: function(entry) { root.removeEntry(entry, true); }
        onActionRequested: function(entry, actionIdentifier) { root.invokeAction(entry, actionIdentifier); }
    }
}
