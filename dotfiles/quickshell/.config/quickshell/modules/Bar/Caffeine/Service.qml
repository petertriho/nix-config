import QtQuick
import Quickshell.Io

QtObject {
    id: root

    property bool active: false
    property int remainingSeconds: 0
    property bool starting: false
    property bool stopping: false
    property bool pendingStart: false
    property int pendingSeconds: 0

    function start(seconds) {
        root.remainingSeconds = seconds;
        root.starting = true;
        inhibitProcess.running = true;
    }

    function activateWithDuration(minutes) {
        var seconds = minutes * 60;
        if (root.stopping) {
            root.pendingStart = true;
            root.pendingSeconds = seconds;
        } else if (root.active || root.starting) {
            root.remainingSeconds = seconds;
            if (seconds > 0)
                countdownTimer.restart();
        } else {
            root.start(seconds);
        }
    }

    function toggleIndefinite() {
        if (root.active || root.starting || root.pendingStart) {
            root.deactivate();
        } else {
            root.activateWithDuration(0);
        }
    }

    function deactivate() {
        root.pendingStart = false;
        root.active = false;
        root.starting = false;
        root.remainingSeconds = 0;
        if (inhibitProcess.running) {
            // Wait for the old process to exit before starting a new session.
            root.stopping = !!inhibitProcess.processId;
            inhibitProcess.running = false;
        }
    }

    property Process inhibitor: Process {
        id: inhibitProcess
        command: ["systemd-inhibit", "--what=idle", "--who=caffeine", "--why=manual inhibit", "--mode=block", "sleep", "infinity"]

        onStarted: {
            if (root.starting && !root.stopping) {
                root.starting = false;
                root.active = true;
            }
        }
        onExited: {
            if (root.stopping) {
                root.stopping = false;
                if (root.pendingStart) {
                    var seconds = root.pendingSeconds;
                    root.pendingStart = false;
                    root.start(seconds);
                }
            } else {
                root.deactivate();
            }
        }
    }

    property Timer countdown: Timer {
        id: countdownTimer
        interval: 1000
        repeat: true
        running: root.starting || (root.active && root.remainingSeconds > 0)
        onTriggered: {
            // Process has no public launch-error signal; a missing started
            // callback at this tick also covers failed executable launches.
            if (root.starting) {
                root.deactivate();
            } else if (--root.remainingSeconds <= 0) {
                root.deactivate();
            }
        }
    }
}
