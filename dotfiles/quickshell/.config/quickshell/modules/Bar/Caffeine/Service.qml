pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io

// Caffeine state shared by every bar: an idle inhibitor with an optional countdown.
// The state survives a config reload. The new generation starts its own inhibitor
// for the rest of the time when the old one is killed.
Singleton {
    id: root

    readonly property bool active: persist.enabled
    // Seconds left, 0 when caffeine is off or has no time limit.
    readonly property int remainingSeconds: persist.enabled && persist.endsAt > 0 ? Math.max(0, Math.ceil((persist.endsAt - root.now) / 1000)) : 0

    // Wall clock in ms, updated each second while a countdown runs.
    property real now: Date.now()
    // True from a stop request until the inhibitor exits, so that this exit
    // does not count as a failure.
    property bool stopping: false

    // Singleton matches its children by index across reloads, so this stays
    // the first (and only) child. Keep the properties free of bindings: a
    // reload overwrites them.
    PersistentProperties {
        id: persist
        reloadableId: "caffeine"

        property bool enabled: false
        // Epoch ms at which caffeine turns off, 0 for no time limit.
        property real endsAt: 0

        onLoaded: {
            root.now = Date.now();
            if (persist.enabled && persist.endsAt > 0 && persist.endsAt <= root.now)
                root.deactivate();
        }
    }

    // 0 minutes = no time limit. While caffeine is on, this only changes the end time.
    function activateWithDuration(minutes) {
        root.now = Date.now();
        persist.endsAt = minutes > 0 ? root.now + minutes * 60000 : 0;
        persist.enabled = true;
    }

    function toggleIndefinite() {
        if (persist.enabled)
            root.deactivate();
        else
            root.activateWithDuration(0);
    }

    function deactivate() {
        root.stopping = root.stopping || inhibitProcess.running;
        persist.enabled = false;
        persist.endsAt = 0;
    }

    property Process inhibitor: Process {
        id: inhibitProcess
        command: ["systemd-inhibit", "--what=idle", "--who=caffeine", "--why=manual inhibit", "--mode=block", "sleep", "infinity"]
        // Process starts it after the reload completes. After a quick off and
        // on, it starts the new inhibitor when the old one has exited.
        running: persist.enabled

        // `running` turns false on exit and on a failed start (missing binary).
        onRunningChanged: {
            if (inhibitProcess.running)
                return;
            if (root.stopping)
                root.stopping = false;
            else if (persist.enabled)
                root.deactivate();
        }
    }

    property Timer countdown: Timer {
        interval: 1000
        repeat: true
        running: persist.enabled && persist.endsAt > 0
        onTriggered: {
            root.now = Date.now();
            if (root.now >= persist.endsAt)
                root.deactivate();
        }
    }
}
