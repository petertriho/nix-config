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
    property var cachedClients: []
    property int activeWorkspaceId: 1

    function rebuild() {
        root.workspacesData = WorkspaceHelpers.normalizeHyprland(
            root.cachedWorkspaces,
            root.activeWorkspaceId,
            root.cachedClients,
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
            console.log("HyprlandBackend " + label + " parse error:", e);
        }
    }

    function refresh() {
        workspacesProcess.exec({ command: ["hyprctl", "workspaces", "-j"] });
        clientsProcess.exec({ command: ["hyprctl", "clients", "-j"] });
    }

    function refreshActive() {
        activeWorkspaceProcess.exec({ command: ["hyprctl", "activeworkspace", "-j"] });
    }

    function switchWorkspace(target) {
        switchWorkspaceProcess.exec({ command: ["hyprctl", "dispatch", "workspace", target] });
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
        id: clientsProcess
        stdout: StdioCollector {
            onStreamFinished: {
                root.parseJson("clients", this.text.trim(), function(data) {
                    root.cachedClients = data;
                    root.rebuild();
                });
            }
        }
    }

    Process {
        id: activeWorkspaceProcess
        stdout: StdioCollector {
            onStreamFinished: {
                root.parseJson("activeworkspace", this.text.trim(), function(data) {
                    root.activeWorkspaceId = data.id;
                    root.rebuild();
                });
            }
        }
    }

    Process {
        id: switchWorkspaceProcess
    }
}
