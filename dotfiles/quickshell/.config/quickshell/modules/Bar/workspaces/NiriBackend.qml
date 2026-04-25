pragma ComponentBehavior: Bound

import QtQuick
import Quickshell.Io
import "workspaceHelpers.js" as WorkspaceHelpers

Item {
    id: root
    width: 0
    height: 0
    visible: false

    property var ignoreClasses: []
    property var windowIcons: ({})
    property var workspacesData: []
    property var cachedWorkspaces: []
    property var cachedWindows: []

    function rebuild() {
        root.workspacesData = WorkspaceHelpers.normalizeNiri(
            root.cachedWorkspaces,
            root.cachedWindows,
            root.ignoreClasses,
            root.windowIcons || ({})
        );
    }

    function parseJson(label, output, onSuccess) {
        if (!output)
            return;

        try {
            onSuccess(JSON.parse(output));
        } catch (e) {
            console.log("NiriBackend " + label + " parse error:", e);
        }
    }

    function refresh() {
        workspacesProcess.exec({ command: ["niri", "msg", "-j", "workspaces"] });
        windowsProcess.exec({ command: ["niri", "msg", "-j", "windows"] });
    }

    function refreshActive() {
        workspacesProcess.exec({ command: ["niri", "msg", "-j", "workspaces"] });
    }

    function switchWorkspace(target) {
        switchWorkspaceProcess.exec({ command: ["niri", "msg", "action", "focus-workspace", target] });
    }

    Process {
        id: workspacesProcess
        stdout: StdioCollector {
            onStreamFinished: {
                root.parseJson("workspaces", this.text.trim(), function(data) {
                    root.cachedWorkspaces = data;
                    root.rebuild();
                });
            }
        }
    }

    Process {
        id: windowsProcess
        stdout: StdioCollector {
            onStreamFinished: {
                root.parseJson("windows", this.text.trim(), function(data) {
                    root.cachedWindows = data;
                    root.rebuild();
                });
            }
        }
    }

    Process {
        id: switchWorkspaceProcess
    }
}
