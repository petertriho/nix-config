pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Services.Notifications
import "../Common"

// NotificationService: the notification server, the toast window and the
// notification center (the "notifications" drawer in Popups).
Singleton {
    id: root

    // Newest first. Each entry is a plain snapshot of one notification (see
    // makeEntry), so that a card can finish its remove animation after the
    // notification object is gone. An entry stays in this list only while
    // its notification is tracked, so `entry.notification` of a listed entry
    // is always live.
    property var entries: []
    // Entry state of the last generation by key (see saveState).
    property var restoredState: ({})
    // Keys of notifications with a replacement to apply (see scheduleReplace).
    property var pendingReplacements: []

    readonly property bool centerVisible: Popups.active === "notifications"
    // Transient notifications only toast.
    readonly property var centerEntries: root.entries.filter(entry => !entry.transient)
    readonly property int notificationCount: root.centerEntries.length
    // The center and the CodexBar drawer cover the toast corner (Overlay
    // layer), so toasts wait while one of them is open.
    readonly property bool toastsCovered: root.centerVisible || Popups.active === "codexbar"
    readonly property var toastEntries: root.toastsCovered ? [] : root.entries.filter(entry => entry.toastVisible)

    // The first use of DesktopEntries starts an asynchronous scan of the
    // desktop files, and lookups find nothing until it ends. Start the scan
    // with the service, so that the first notification finds its app.
    readonly property var desktopApps: DesktopEntries.applications

    onEntriesChanged: root.saveState()

    // The open center shows every notification, so their toasts are done.
    onCenterVisibleChanged: {
        if (root.centerVisible)
            root.hideToasts(entry => !entry.transient);
    }

    // Toasts that waited behind a drawer get their full time when it closes.
    onToastsCoveredChanged: {
        if (!root.toastsCovered)
            root.restartToasts(() => true);
    }

    function toggleCenter() {
        Popups.toggle("notifications");
    }

    function showCenter() {
        Popups.open("notifications");
    }

    function hideCenter() {
        if (root.centerVisible)
            Popups.close();
    }

    // Desktop entry of the sending app, or null.
    function findApp(desktopEntry, appName) {
        for (const name of [desktopEntry, appName]) {
            if (!name)
                continue;
            const app = DesktopEntries.heuristicLookup(name.replace(/\.desktop$/, ""));
            if (app)
                return app;
        }
        return null;
    }

    // Image URL for an icon value, or "" when it does not resolve. A URL stays
    // as it is. A bare path gets "file://", because the image would resolve it
    // against the URL of the Quickshell module. A name goes through the icon theme.
    function iconUrl(icon) {
        if (!icon)
            return "";
        if (icon.startsWith("/"))
            return "file://" + icon;
        if (icon.includes(":/"))
            return icon;
        return Quickshell.iconPath(icon, true);
    }

    // The image, then the app icon, then the icon of the app's desktop entry.
    function iconFor(notification, app) {
        const url = root.iconUrl(notification.image) || root.iconUrl(notification.appIcon);
        if (url)
            return url;
        return app ? root.iconUrl(app.icon) : "";
    }

    // Toast duration in ms. 0 = the toast stays until it is dismissed.
    function toastTimeout(notification) {
        if (notification.urgency === NotificationUrgency.Critical)
            return 0;
        // The sender's timeout in ms: -1 = server default, 0 = never.
        if (notification.expireTimeout >= 0)
            return notification.expireTimeout;
        return Config.notifications.toastTimeoutMs;
    }

    // Plain snapshot of a notification. A toast ends at `toastUntil` (epoch
    // ms), 0 = when it is dismissed.
    function makeEntry(notification, createdAt, toast) {
        const app = root.findApp(notification.desktopEntry, notification.appName);
        const actions = notification.actions.map(action => ({
                    identifier: action.identifier,
                    text: action.text
                }));
        const timeoutMs = root.toastTimeout(notification);
        return {
            // Server ids are unique for the life of the process, also across reloads.
            key: String(notification.id),
            notification: notification,
            appName: notification.appName,
            summary: notification.summary,
            body: notification.body,
            iconSource: root.iconFor(notification, app),
            actions: actions,
            hasDefaultAction: actions.some(action => action.identifier === "default"),
            canOpenApp: app !== null,
            critical: notification.urgency === NotificationUrgency.Critical,
            transient: notification.transient,
            timeoutMs: timeoutMs,
            toastVisible: toast,
            toastUntil: toast && timeoutMs > 0 ? Date.now() + timeoutMs : 0,
            createdAt: createdAt
        };
    }

    function addNotification(notification) {
        const now = Date.now();
        const saved = notification.lastGeneration ? root.restoredState[String(notification.id)] : undefined;
        let entry;
        if (saved) {
            // From before a reload: same age, and a toast keeps its remaining time.
            const toast = saved.toastVisible && (saved.toastUntil === 0 || saved.toastUntil > now);
            entry = root.makeEntry(notification, saved.createdAt, toast);
            entry.toastUntil = toast ? saved.toastUntil : 0;
        } else {
            // Without saved state, a notification from before a reload goes to
            // the center only. One that arrives while the center is open shows
            // there, unless the center skips it (transient).
            entry = root.makeEntry(notification, now, !notification.lastGeneration && (notification.transient || !root.centerVisible));
        }

        // A transient notification shows only as a toast. Without one, it is
        // done, and the server drops it when it stays untracked.
        if (entry.transient && !entry.toastVisible)
            return;
        notification.tracked = true;

        const key = entry.key;
        notification.closed.connect(() => root.removeEntry(key));
        // A replacement (same id) updates the properties in place and does
        // not emit `notification` again.
        const replaced = () => root.scheduleReplace(key);
        for (const changed of [notification.appNameChanged, notification.summaryChanged, notification.bodyChanged, notification.appIconChanged, notification.imageChanged, notification.actionsChanged, notification.urgencyChanged, notification.expireTimeoutChanged, notification.hintsChanged])
            changed.connect(replaced);

        root.insertEntry(entry);
    }

    // A replacement changes several properties at once. Apply it once.
    function scheduleReplace(key) {
        if (!root.pendingReplacements.includes(key))
            root.pendingReplacements.push(key);
        Qt.callLater(root.applyReplacements);
    }

    function applyReplacements() {
        const keys = root.pendingReplacements;
        root.pendingReplacements = [];
        for (const key of keys)
            root.replaceEntry(key);
    }

    // A replacement counts as a new notification: the card moves to the top
    // and toasts with the rules of a new one (a showing toast starts its time
    // again). It toasts also when its notification is from before a reload.
    function replaceEntry(key) {
        const current = root.findEntry(key);
        if (!current)
            return;
        const notification = current.notification;
        // Move the row first, then swap the object in place. A ScriptModel
        // build without a final replace pass keeps the old object of a moved
        // row. The two steps give the new object to the delegates with and
        // without that pass.
        root.entries = [current].concat(root.entries.filter(entry => entry.key !== key));
        root.insertEntry(root.makeEntry(notification, Date.now(), notification.transient || !root.centerVisible));
    }

    // Replaces the entry with the same key and puts the entry at its place by
    // `createdAt` (newest first), then applies the toast and history limits.
    // A new or replaced entry is the newest. A restored entry keeps its saved
    // age, because the server emits the restored notifications in creation
    // order, not in the order of `entries`.
    function insertEntry(entry) {
        const others = root.entries.filter(other => other.key !== entry.key);
        let index = others.findIndex(other => other.createdAt <= entry.createdAt);
        if (index < 0)
            index = others.length;
        const sorted = others.slice(0, index).concat([entry], others.slice(index));

        const next = [];
        const closing = [];
        let toasts = 0;
        for (const candidate of sorted) {
            let kept = candidate;
            // Toasts over the limit end now. A transient one has nothing left to show.
            if (kept.toastVisible && ++toasts > Config.notifications.maxToasts) {
                if (kept.transient) {
                    closing.push(kept);
                    continue;
                }
                kept = Object.assign({}, kept, {
                    toastVisible: false,
                    toastUntil: 0
                });
            }
            if (next.length >= Config.notifications.maxHistory) {
                closing.push(kept);
                continue;
            }
            next.push(kept);
        }
        root.entries = next;
        root.expireAll(closing);
    }

    function findEntry(key) {
        return root.entries.find(entry => entry.key === key) || null;
    }

    function removeEntry(key) {
        const next = root.entries.filter(entry => entry.key !== key);
        if (next.length !== root.entries.length)
            root.entries = next;
    }

    // The caller removes the entries first, so that the `closed` handlers
    // find nothing left to remove.
    function expireAll(closing) {
        for (const entry of closing)
            entry.notification.expire();
    }

    function hideToast(entry) {
        root.hideToasts(candidate => candidate.key === entry.key);
    }

    // Ends the toasts that match. A transient notification has nothing left to
    // show, so it expires.
    function hideToasts(match) {
        const next = [];
        const closing = [];
        let changed = false;
        for (const entry of root.entries) {
            if (!entry.toastVisible || !match(entry)) {
                next.push(entry);
                continue;
            }
            changed = true;
            if (entry.transient)
                closing.push(entry);
            else
                next.push(Object.assign({}, entry, {
                    toastVisible: false,
                    toastUntil: 0
                }));
        }
        if (!changed)
            return;
        root.entries = next;
        root.expireAll(closing);
    }

    // The pointer left the toast: it gets its full time again.
    function restartToast(entry) {
        root.restartToasts(candidate => candidate.key === entry.key);
    }

    function restartToasts(match) {
        const now = Date.now();
        let changed = false;
        const next = root.entries.map(entry => {
            if (!entry.toastVisible || entry.timeoutMs <= 0 || !match(entry))
                return entry;
            changed = true;
            return Object.assign({}, entry, {
                toastUntil: now + entry.timeoutMs
            });
        });
        if (changed)
            root.entries = next;
    }

    function dismiss(entry) {
        const current = root.findEntry(entry.key);
        if (!current)
            return;
        root.removeEntry(current.key);
        current.notification.dismiss();
    }

    function clearAll() {
        const closing = root.entries;
        root.entries = [];
        for (const entry of closing)
            entry.notification.dismiss();
        root.hideCenter();
    }

    function invokeAction(entry, identifier) {
        const current = root.findEntry(entry.key);
        if (!current)
            return;
        const action = current.notification.actions.find(candidate => candidate.identifier === identifier);
        if (!action)
            return;
        // Closes the notification unless it is resident.
        action.invoke();
        root.hideToast(current);
    }

    // A click on a card: the default action, else open the sending app.
    function activate(entry) {
        if (entry.hasDefaultAction) {
            root.invokeAction(entry, "default");
            root.hideCenter();
            return;
        }
        const current = root.findEntry(entry.key);
        if (!current)
            return;
        const app = root.findApp(current.notification.desktopEntry, current.appName);
        if (!app)
            return;
        app.execute();
        root.dismiss(current);
        root.hideCenter();
    }

    // Plain data only, because the JS objects of the old generation die with it.
    function saveState() {
        const state = {};
        for (const entry of root.entries)
            state[entry.key] = {
                createdAt: entry.createdAt,
                toastVisible: entry.toastVisible,
                toastUntil: entry.toastUntil
            };
        persist.savedEntries = JSON.stringify(state);
    }

    // Keeps the age and the toast of each entry across a reload. Singleton
    // matches its children by index across reloads, so this stays the first
    // child. Keep the properties free of bindings: a reload overwrites them.
    // The reload restores them before the server emits the notifications of
    // the last generation again.
    PersistentProperties {
        id: persist
        reloadableId: "notifications"

        // JSON: entry key -> {createdAt, toastVisible, toastUntil}.
        property string savedEntries: "{}"

        onLoaded: root.restoredState = JSON.parse(persist.savedEntries)
    }

    NotificationServer {
        id: notificationServer
        actionsSupported: true
        imageSupported: true
        bodySupported: true
        persistenceSupported: true
        // After a reload the server emits each notification of the last
        // generation again, with `lastGeneration` set. Tracking keeps it.
        keepOnReload: true

        onNotification: function (notification) {
            root.addNotification(notification);
        }
    }

    Toasts {
        entries: root.toastEntries
    }

    DeferredLoader {
        open: root.centerVisible

        Center {
            open: root.centerVisible
            entries: root.centerEntries
            onCloseRequested: root.hideCenter()
            onClearRequested: root.clearAll()
        }
    }
}
