pragma Singleton
pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import "../../Common"
import "workspaceHelpers.js" as WorkspaceHelpers

// Workspaces and window titles for every bar. Niri: the event stream sends the
// full state on connect, then deltas that workspaceHelpers.js applies to the
// caches. Hyprland: a debounced refresh after each socket event.
Singleton {
    id: root

    property string compositorName: ""
    property var ignoreClasses: Config.workspaces.ignoreClasses
    property int maxIcons: Config.workspaces.maxIcons
    property var windowIcons: Config.windowIcons
    // Niri polls only while its event stream is down.
    property int updateInterval: Config.workspaces.updateInterval
    property int activeUpdateInterval: Config.workspaces.activeUpdateInterval
    // Hyprland events drive the updates. This slow poll only catches a missed event.
    property int hyprlandFallbackInterval: 60000
    property bool unsupportedCompositorLogged: false

    property var cachedHyprlandWorkspaces: []
    property var cachedHyprlandClients: []
    property var cachedHyprlandMonitors: []
    property var cachedNiriWorkspaces: []
    property var cachedNiriWindows: []
    property int niriStreamFailures: 0
    readonly property bool niriPolling: root.compositorName === "niri" && !niriEventStream.running
    readonly property string focusedOutput: root.compositorName === "niri" ? WorkspaceHelpers.focusedNiriOutput(root.cachedNiriWorkspaces) : ""

    function workspacesForOutput(outputName) {
        if (root.compositorName === "hyprland")
            return WorkspaceHelpers.normalizeHyprland(outputName, root.cachedHyprlandWorkspaces, root.cachedHyprlandClients, root.cachedHyprlandMonitors, root.ignoreClasses, root.windowIcons || ({}), root.maxIcons);

        if (root.compositorName === "niri")
            return WorkspaceHelpers.normalizeNiri(outputName, root.cachedNiriWorkspaces, root.cachedNiriWindows, root.ignoreClasses, root.windowIcons || ({}), root.maxIcons);

        return [];
    }

    function activeWindowTitleForOutput(outputName) {
        if (root.compositorName === "hyprland")
            return WorkspaceHelpers.activeHyprlandWindowTitleForOutput(outputName, root.cachedHyprlandMonitors, root.cachedHyprlandWorkspaces);

        if (root.compositorName === "niri")
            return WorkspaceHelpers.activeNiriWindowTitleForOutput(outputName, root.cachedNiriWorkspaces, root.cachedNiriWindows);

        return "";
    }

    // The niri window object (`niri msg -j windows`) that the title of an
    // output shows, or null. Null on Hyprland: the window actions below are
    // for niri only.
    function activeWindowForOutput(outputName) {
        if (root.compositorName === "niri")
            return WorkspaceHelpers.activeNiriWindowForOutput(outputName, root.cachedNiriWorkspaces, root.cachedNiriWindows);

        return null;
    }

    function toggleOverview() {
        if (root.compositorName === "niri")
            Quickshell.execDetached(["niri", "msg", "action", "toggle-overview"]);
    }

    // Moves the column focus on the focused output.
    function focusColumn(direction) {
        if (root.compositorName === "niri")
            Quickshell.execDetached(["niri", "msg", "action", direction < 0 ? "focus-column-left" : "focus-column-right"]);
    }

    // Focuses the window, then runs the action as its key binding would.
    // Column actions such as maximize-column have no window id argument. Niri
    // moves the pointer when the focus goes to another output. The click that
    // opened the menu focused the output of the window, so this focus change
    // does not move it. One `sh` keeps the two actions in order. The id and the action are arguments of the
    // script, so the shell does not parse them.
    function windowAction(windowId, action) {
        if (root.compositorName !== "niri")
            return;

        Quickshell.execDetached(["sh", "-c", "niri msg action focus-window --id \"$1\" && shift && niri msg action \"$@\"", "sh", String(windowId)].concat(action));
    }

    // Actions of the workspace pills, for niri only. A workspace reference is
    // a name or an index, and an index resolves on the focused output. A press
    // on the bar focuses its output, so the index of a pill points to the
    // workspace of that pill. The `--opt=value` forms and "--" keep a name
    // that starts with "-" from becoming an option.
    function niriAction(args) {
        if (root.compositorName === "niri")
            Quickshell.execDetached(["niri", "msg", "action"].concat(args));
    }

    // Up (direction < 0) is the previous workspace on the focused output.
    function focusWorkspaceRelative(direction) {
        root.niriAction([direction < 0 ? "focus-workspace-up" : "focus-workspace-down"]);
    }

    function focusWindow(windowId) {
        root.niriAction(["focus-window", "--id", String(windowId)]);
    }

    function closeWindows(windowIds) {
        for (const windowId of windowIds)
            root.niriAction(["close-window", "--id", String(windowId)]);
    }

    // `index` is 1-based. Niri clamps it to the workspaces of the output.
    function moveWorkspaceToIndex(reference, index) {
        root.niriAction(["move-workspace-to-index", "--reference=" + reference, "--", String(index)]);
    }

    function moveWorkspaceToMonitor(reference, output) {
        root.niriAction(["move-workspace-to-monitor", "--reference=" + reference, "--", output]);
    }

    // Niri ignores a name that another workspace already has. A named
    // workspace stays when it is empty, until its name is cleared.
    function setWorkspaceName(reference, name) {
        root.niriAction(["set-workspace-name", "--workspace=" + reference, "--", name]);
    }

    function unsetWorkspaceName(reference) {
        root.niriAction(["unset-workspace-name", "--", reference]);
    }

    // The mini-map layout of a niri workspace (see niriWorkspaceMap() in
    // workspaceHelpers.js), or null on other compositors.
    function workspaceMap(workspaceId, options) {
        if (root.compositorName !== "niri")
            return null;

        return WorkspaceHelpers.niriWorkspaceMap(workspaceId, root.cachedNiriWorkspaces, root.cachedNiriWindows, root.ignoreClasses, root.windowIcons || ({}), options);
    }

    function logUnsupportedCompositor() {
        if (root.unsupportedCompositorLogged)
            return;

        root.unsupportedCompositorLogged = true;
        console.log("WorkspaceService: unsupported compositor");
    }

    function parseJson(label, output, onSuccess) {
        if (!output)
            return;

        try {
            onSuccess(JSON.parse(output));
        } catch (e) {
            console.log("WorkspaceService " + label + " parse error:", e);
        }
    }

    function refresh() {
        if (root.compositorName === "hyprland") {
            hyprlandWorkspacesProcess.exec({
                command: ["hyprctl", "workspaces", "-j"]
            });
            hyprlandClientsProcess.exec({
                command: ["hyprctl", "clients", "-j"]
            });
            hyprlandMonitorsProcess.exec({
                command: ["hyprctl", "monitors", "-j"]
            });
        } else if (root.compositorName === "niri") {
            niriWorkspacesProcess.exec({
                command: ["niri", "msg", "-j", "workspaces"]
            });
            niriWindowsProcess.exec({
                command: ["niri", "msg", "-j", "windows"]
            });
        }
    }

    // Niri fallback poll for the active workspace while the event stream is down.
    function refreshActive() {
        if (root.compositorName === "niri") {
            niriWorkspacesProcess.exec({
                command: ["niri", "msg", "-j", "workspaces"]
            });
        }
    }

    function switchWorkspace(target) {
        if (!target)
            return;

        if (root.compositorName === "hyprland") {
            switchWorkspaceProcess.exec({
                command: ["hyprctl", "dispatch", "workspace", target]
            });
        } else if (root.compositorName === "niri") {
            switchWorkspaceProcess.exec({
                command: ["niri", "msg", "action", "focus-workspace", target]
            });
        }
    }

    function niriStreamBackoffInterval() {
        if (root.niriStreamFailures >= 4)
            return 30000;
        if (root.niriStreamFailures === 3)
            return 15000;
        if (root.niriStreamFailures === 2)
            return 5000;
        return 2000;
    }

    // Patch the caches with the event. Only an event that cannot be patched
    // starts a (debounced) full refresh.
    function handleNiriEvent(line) {
        if (!line)
            return;

        let event;
        try {
            event = JSON.parse(line);
        } catch (e) {
            console.log("WorkspaceService niri event parse error:", e);
            niriDebounce.restart();
            return;
        }

        if (root.niriStreamFailures > 0) {
            root.niriStreamFailures = 0;
            niriStreamRestart.interval = 2000;
        }

        const result = WorkspaceHelpers.applyNiriEvent({
            workspaces: root.cachedNiriWorkspaces,
            windows: root.cachedNiriWindows
        }, event);
        if (result.workspaces)
            root.cachedNiriWorkspaces = result.workspaces;
        if (result.windows)
            root.cachedNiriWindows = result.windows;
        if (result.refresh)
            niriDebounce.restart();
    }

    // Socket events burst; coalesce into one refresh.
    function onHyprlandEvent() {
        if (root.compositorName !== "hyprland")
            return;
        hyprlandDebounce.restart();
    }

    Component.onCompleted: {
        const env = {
            "NIRI_SOCKET": Quickshell.env("NIRI_SOCKET"),
            "HYPRLAND_INSTANCE_SIGNATURE": Quickshell.env("HYPRLAND_INSTANCE_SIGNATURE")
        };
        root.compositorName = WorkspaceHelpers.detectCompositor(env);

        if (!root.compositorName) {
            root.logUnsupportedCompositor();
            return;
        }

        // Niri needs no query here: the event stream starts with the full state.
        if (root.compositorName === "hyprland")
            root.refresh();
    }

    Timer {
        id: updateTimer
        interval: root.compositorName === "hyprland" ? root.hyprlandFallbackInterval : root.updateInterval
        repeat: true
        running: root.compositorName === "hyprland" || root.niriPolling
        onTriggered: root.refresh()
    }

    Timer {
        id: activeWorkspaceTimer
        interval: root.activeUpdateInterval
        repeat: true
        running: root.niriPolling
        onTriggered: root.refreshActive()
    }

    Timer {
        id: hyprlandDebounce
        interval: 250
        repeat: false
        onTriggered: root.refresh()
    }

    Timer {
        id: niriDebounce
        interval: 250
        repeat: false
        onTriggered: root.refresh()
    }

    Timer {
        id: niriStreamRestart
        interval: 2000
        repeat: false
        onTriggered: {
            if (root.compositorName === "niri" && !niriEventStream.running)
                niriEventStream.running = true;
        }
    }

    Connections {
        target: root.compositorName === "hyprland" ? Hyprland : null
        function onRawEvent(event) {
            root.onHyprlandEvent();
        }
    }

    Process {
        id: niriEventStream
        command: ["niri", "msg", "--json", "event-stream"]
        running: root.compositorName === "niri"
        stdout: SplitParser {
            onRead: data => root.handleNiriEvent(data)
        }
        onExited: {
            if (root.compositorName !== "niri")
                return;
            root.niriStreamFailures += 1;
            const nextInterval = root.niriStreamBackoffInterval();
            if (root.niriStreamFailures === 1 || nextInterval !== niriStreamRestart.interval)
                console.log("WorkspaceService: niri event-stream exited, restarting in " + nextInterval + "ms");
            niriStreamRestart.interval = nextInterval;
            niriStreamRestart.restart();
        }
    }

    Process {
        id: hyprlandWorkspacesProcess
        stdout: StdioCollector {
            onStreamFinished: {
                root.parseJson("hyprland workspaces", this.text.trim(), function (data) {
                    root.cachedHyprlandWorkspaces = data;
                });
            }
        }
    }

    Process {
        id: hyprlandClientsProcess
        stdout: StdioCollector {
            onStreamFinished: {
                root.parseJson("hyprland clients", this.text.trim(), function (data) {
                    root.cachedHyprlandClients = data;
                });
            }
        }
    }

    Process {
        id: hyprlandMonitorsProcess
        stdout: StdioCollector {
            onStreamFinished: {
                root.parseJson("hyprland monitors", this.text.trim(), function (data) {
                    root.cachedHyprlandMonitors = data;
                });
            }
        }
    }

    Process {
        id: niriWorkspacesProcess
        stdout: StdioCollector {
            onStreamFinished: {
                root.parseJson("niri workspaces", this.text.trim(), function (data) {
                    root.cachedNiriWorkspaces = data;
                });
            }
        }
    }

    Process {
        id: niriWindowsProcess
        stdout: StdioCollector {
            onStreamFinished: {
                root.parseJson("niri windows", this.text.trim(), function (data) {
                    root.cachedNiriWindows = data;
                });
            }
        }
    }

    Process {
        id: switchWorkspaceProcess
    }
}
