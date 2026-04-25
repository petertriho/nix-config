pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import "workspaces" as WorkspaceBackends
import "workspaces/workspaceHelpers.js" as WorkspaceHelpers

Row {
    id: root
    spacing: 4

    // Accept colors from parent
    property var colors
    property var workspacesConfig
    property var fontsConfig
    property var windowIcons
    property string compositorName: ""
    property bool unsupportedCompositorLogged: false
    property var workspacesData: root.compositorName === "hyprland"
        ? hyprlandBackend.workspacesData
        : root.compositorName === "niri"
            ? niriBackend.workspacesData
            : []

    function logUnsupportedCompositor() {
        if (root.unsupportedCompositorLogged)
            return;

        root.unsupportedCompositorLogged = true;
        console.log("WorkspacesModule: unsupported compositor");
    }

    function refreshBackend() {
        if (root.compositorName === "hyprland")
            hyprlandBackend.refresh();
        else if (root.compositorName === "niri")
            niriBackend.refresh();
    }

    function refreshActiveBackend() {
        if (root.compositorName === "hyprland")
            hyprlandBackend.refreshActive();
        else if (root.compositorName === "niri")
            niriBackend.refreshActive();
    }

    function switchBackendWorkspace(target) {
        if (root.compositorName === "hyprland")
            hyprlandBackend.switchWorkspace(target);
        else if (root.compositorName === "niri")
            niriBackend.switchWorkspace(target);
    }

    Component.onCompleted: {
        detectCompositorProcess.exec({
            command: ["sh", "-lc", "env"]
        });
    }

    Timer {
        id: updateTimer
        interval: root.workspacesConfig.updateInterval
        repeat: true
        running: root.compositorName.length > 0
        onTriggered: {
            root.refreshBackend();
        }
    }

    Timer {
        id: activeWorkspaceTimer
        interval: root.workspacesConfig.activeUpdateInterval
        repeat: true
        running: root.compositorName.length > 0
        onTriggered: {
            root.refreshActiveBackend();
        }
    }

    Process {
        id: detectCompositorProcess
        stdout: StdioCollector {
            onStreamFinished: {
                const env = WorkspaceHelpers.parseEnvironmentSnapshot(this.text.trim());
                root.compositorName = WorkspaceHelpers.detectCompositor(env);

                if (!root.compositorName) {
                    root.logUnsupportedCompositor();
                    return;
                }

                root.refreshBackend();
                root.refreshActiveBackend();
            }
        }
    }

    WorkspaceBackends.HyprlandBackend {
        id: hyprlandBackend
        ignoreClasses: root.workspacesConfig ? root.workspacesConfig.ignoreClasses : []
        windowIcons: root.windowIcons
    }

    WorkspaceBackends.NiriBackend {
        id: niriBackend
        ignoreClasses: root.workspacesConfig ? root.workspacesConfig.ignoreClasses : []
        windowIcons: root.windowIcons
    }

    // Repeater for workspace buttons
    Repeater {
        id: workspaceRepeater
        model: root.workspacesData

        delegate: Rectangle {
            id: workspaceDelegate
            required property var modelData

            property var icons: {
                const iconsArray = [];
                if (modelData && modelData.windowIcons) {
                    for (let i = 0; i < modelData.windowIcons.length; i++) {
                        if (modelData.windowIcons[i]) {
                            iconsArray.push(modelData.windowIcons[i]);
                        }
                    }
                }
                return iconsArray;
            }
            property string workspaceName: modelData.name || ""
            property string switchTarget: modelData.switchTarget || workspaceName
            property bool isActive: modelData.active || false

            width: {
                const baseWidth = root.workspacesConfig.baseWidth;
                const iconWidth = icons.length > 0 ? icons.length * root.workspacesConfig.iconWidth + root.workspacesConfig.iconPadding : 0;
                return Math.max(baseWidth, iconWidth);
            }
            height: root.workspacesConfig.height
            color: isActive ? root.colors.bg_highlight : root.colors.bg_dark
            radius: 4

            Row {
                anchors.centerIn: parent
                spacing: root.workspacesConfig.spacing

                Text {
                    text: workspaceDelegate.workspaceName
                    color: root.colors.fg
                    font.pixelSize: root.workspacesConfig.fontSize
                    anchors.verticalCenter: parent.verticalCenter
                }

                Repeater {
                    model: workspaceDelegate.icons
                    delegate: Text {
                        required property var modelData
                        property string iconText: typeof modelData === "string" ? modelData : (modelData.icon || "")
                        property bool isFocusedIcon: typeof modelData === "object" && !!modelData.focused
                        text: iconText
                        color: isFocusedIcon ? root.colors.blue : root.colors.fg
                        font.pixelSize: root.workspacesConfig.iconFontSize
                        font.family: root.fontsConfig ? root.fontsConfig.defaultFamily : "JetBrainsMono Nerd Font Propo"
                        visible: iconText.length > 0
                        anchors.verticalCenter: parent.verticalCenter
                    }
                }
            }

            MouseArea {
                anchors.fill: parent
                onClicked: {
                    root.switchBackendWorkspace(workspaceDelegate.switchTarget);
                }
            }
        }
    }
}
