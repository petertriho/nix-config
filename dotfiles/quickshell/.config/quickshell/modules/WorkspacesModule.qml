import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import ".."

Row {
    id: root
    spacing: 4
    property var activeWorkspace: 1
    property var workspacesData: []

    // Window class to icon mapping
    property var windowIcons: {
        "Alacritty": "󰆍",
        "chromium": "󰊯",
        "com.mitchellh.ghostty": "󰆍",
        "discord": "󰙯",
        "firefox": "󰈹",
        "floorp": "󰈹",
        "kitty": "󰄛",
        "nautilus": "󰉋",
        "org.kde.dolphin": "󰉋",
        "slack": "󰒱",
        "thunar": "󰉋",
        "wezterm": "󰆍"
    }

    function getWindowIcon(windowClass) {
        console.log(windowClass);
        // var icon = windowIcons[windowClass] || "󰘔";
        var icon = windowIcons[windowClass] || windowClass;
        return icon;
    }

    Component.onCompleted: {
        updateWorkspaces();
        updateTimer.start();
        updateActiveWorkspace();
        activeWorkspaceTimer.start();
        updateClients();
    }

    Timer {
        id: updateTimer
        interval: 200
        repeat: true
        onTriggered: updateWorkspaces()
    }

    Timer {
        id: activeWorkspaceTimer
        interval: 100
        repeat: true
        onTriggered: updateActiveWorkspace()
    }

    Process {
        id: workspaceProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    parseWorkspaces(output);
                }
            }
        }
    }

    Process {
        id: activeWorkspaceProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    parseActiveWorkspace(output);
                }
            }
        }
    }

    Process {
        id: clientsProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    parseClients(output);
                }
            }
        }
    }

    function updateWorkspaces() {
        workspaceProcess.exec({
            command: ["hyprctl", "workspaces", "-j"]
        });
        updateClients();
    }

    function updateActiveWorkspace() {
        activeWorkspaceProcess.exec({
            command: ["hyprctl", "activeworkspace", "-j"]
        });
    }

    function updateClients() {
        clientsProcess.exec({
            command: ["hyprctl", "clients", "-j"]
        });
    }

    function parseWorkspaces(jsonOutput) {
        try {
            var parsedWorkspaces = JSON.parse(jsonOutput);

            // Build workspaces data array
            var newWorkspacesData = [];

            for (var i = 0; i < parsedWorkspaces.length; i++) {
                var ws = parsedWorkspaces[i];
                var windowIcons = [];

                // Get window icons for this workspace
                for (var j = 0; j < clientsData.length; j++) {
                    var client = clientsData[j];
                    if (client.workspace.id === ws.id) {
                        var icon = getWindowIcon(client.class);
                        windowIcons.push(icon);
                    }
                }

                newWorkspacesData.push({
                    id: ws.id,
                    name: ws.name,
                    windows: ws.windows,
                    active: ws.id === activeWorkspace,
                    windowIcons: windowIcons.slice() // Create a copy to ensure it's a JS array
                });
            }

            console.log("Setting workspacesData with activeWorkspace:", activeWorkspace);
            console.log("Sample workspace data:", newWorkspacesData[0]);
            root.workspacesData = newWorkspacesData;
        } catch (e) {
            console.log("Error parsing workspaces:", e);
        }
    }

    function parseActiveWorkspace(jsonOutput) {
        try {
            var activeWorkspaceData = JSON.parse(jsonOutput);
            activeWorkspace = activeWorkspaceData.id;

            // Refresh workspaces to update active state
            updateWorkspaces();
        } catch (e) {
            console.log("Error parsing active workspace:", e);
            console.log("Active workspace data:", activeWorkspaceData);
        }
    }

    property var clientsData: []

    function parseClients(jsonOutput) {
        try {
            clientsData = JSON.parse(jsonOutput);
        } catch (e) {
            console.log("Error parsing clients:", e);
        }
    }

    // Repeater for workspace buttons
    Repeater {
        id: workspaceRepeater
        model: workspacesData

        delegate: Rectangle {
            id: workspaceDelegate

            property var icons: {
                var iconsArray = [];
                if (modelData && modelData.windowIcons) {
                    // Check if it's array-like (has length and can be indexed)
                    if (typeof modelData.windowIcons.length === 'number' && modelData.windowIcons.length > 0) {
                        // Convert QML list/array to JavaScript array
                        for (var i = 0; i < modelData.windowIcons.length; i++) {
                            iconsArray.push(modelData.windowIcons[i]);
                        }
                    }
                }
                return iconsArray;
            }
            property string workspaceName: modelData.name || ""
            property bool isActive: modelData.active || false
            property int workspaceId: modelData.id || 1

            Component.onCompleted: {
                console.log("Delegate for workspace", workspaceId, "name:", workspaceName, "active:", isActive);
            }

            width: {
                var baseWidth = 30;
                var iconWidth = icons.length > 0 ? icons.length * 16 + 12 : 0;
                return Math.max(baseWidth, iconWidth);
            }
            height: 20
            color: isActive ? Colors.colors.bg_highlight : Colors.colors.bg_dark
            radius: 4

            Row {
                anchors.centerIn: parent
                spacing: 4

                Text {
                    text: workspaceName
                    color: Colors.colors.fg
                    font.pixelSize: 12
                }

                Repeater {
                    model: icons
                    delegate: Text {
                        property string iconText: modelData || ""
                        text: iconText
                        color: Colors.colors.fg
                        font.pixelSize: 12
                        font.family: "JetBrainsMono Nerd Font Propo"
                        visible: iconText.length > 0
                        anchors.verticalCenter: parent.verticalCenter
                    }
                }
            }

            MouseArea {
                anchors.fill: parent
                onClicked: {
                    switchWorkspaceProcess.exec({
                        command: ["hyprctl", "dispatch", "workspace", workspaceId.toString()]
                    });
                }
            }
        }
    }

    Process {
        id: switchWorkspaceProcess
    }
}
