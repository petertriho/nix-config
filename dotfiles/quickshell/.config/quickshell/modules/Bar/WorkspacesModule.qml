import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io

Row {
    id: root
    spacing: 4

    // Accept colors from parent
    property QtObject colors
    property QtObject workspacesConfig
    property QtObject fontsConfig
    property var windowIcons

    property var activeWorkspace: 1
    property var workspacesData: []

    // Window icons are now loaded from config

    function getWindowIcon(windowClass) {
        return root.windowIcons[windowClass] || "󰘔";
    }

    Component.onCompleted: {
        updateClients();
        updateWorkspaces();
        updateTimer.start();
        updateActiveWorkspace();
        activeWorkspaceTimer.start();
    }

    Timer {
        id: updateTimer
        interval: workspacesConfig.updateInterval
        repeat: true
        onTriggered: updateWorkspaces()
    }

    Timer {
        id: activeWorkspaceTimer
        interval: workspacesConfig.activeUpdateInterval
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
                if (clientsData && clientsData.length > 0) {
                    for (var j = 0; j < clientsData.length; j++) {
                        var client = clientsData[j];
                        if (client.workspace && client.workspace.id === ws.id) {
                            if (client.class == "xwaylandvideobridge") {
                                continue;
                            }
                            var icon = getWindowIcon(client.class);
                            windowIcons.push(icon);
                        }
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
        }
    }

    property var clientsData: []

    function parseClients(jsonOutput) {
        try {
            clientsData = JSON.parse(jsonOutput);
            // Refresh workspaces to update window icons
            updateWorkspaces();
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

            width: {
                var baseWidth = workspacesConfig.baseWidth;
                var iconWidth = icons.length > 0 ? icons.length * workspacesConfig.iconWidth + workspacesConfig.iconPadding : 0;
                return Math.max(baseWidth, iconWidth);
            }
            height: workspacesConfig.height
            color: isActive ? colors.bg_highlight : colors.bg_dark
            radius: 4

            Row {
                anchors.centerIn: parent
                spacing: workspacesConfig.spacing

                Text {
                    text: workspaceName
                    color: colors.fg
                    font.pixelSize: workspacesConfig.fontSize
                }

                Repeater {
                    model: icons
                    delegate: Text {
                        property string iconText: modelData || ""
                        text: iconText
                        color: colors.fg
                        font.pixelSize: workspacesConfig.iconFontSize
                        font.family: fontsConfig ? fontsConfig.defaultFamily : "JetBrainsMono Nerd Font Propo"
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
