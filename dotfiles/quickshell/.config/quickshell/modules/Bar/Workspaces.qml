pragma ComponentBehavior: Bound

import QtQuick

Item {
    id: root
    implicitWidth: workspaceRow.implicitWidth
    implicitHeight: root.workspacesConfig.height

    // Accept colors from parent
    property var colors
    property var workspacesConfig
    property var fontsConfig
    property string outputName: ""
    property var workspaceService
    property var workspacesData: {
        if (!root.workspaceService)
            return [];

        root.workspaceService.compositorName;
        root.workspaceService.cachedHyprlandWorkspaces;
        root.workspaceService.cachedHyprlandClients;
        root.workspaceService.cachedHyprlandMonitors;
        root.workspaceService.cachedNiriWorkspaces;
        root.workspaceService.cachedNiriWindows;
        root.workspaceService.ignoreClasses;
        root.workspaceService.windowIcons;

        return root.workspaceService.workspacesForOutput(root.outputName);
    }

    Row {
        id: workspaceRow
        anchors.verticalCenter: parent.verticalCenter
        spacing: root.workspacesConfig.spacing

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
                property bool hovered: false

                width: {
                    const baseWidth = root.workspacesConfig.baseWidth;
                    const iconWidth = icons.length > 0 ? icons.length * root.workspacesConfig.iconWidth + root.workspacesConfig.iconPadding : 0;
                    return Math.max(baseWidth, iconWidth);
                }
                height: root.workspacesConfig.height
                color: isActive || hovered ? root.colors.base02 : root.colors.base01
                radius: 4

                Row {
                    anchors.centerIn: parent
                    spacing: root.workspacesConfig.spacing

                    Text {
                        text: workspaceDelegate.workspaceName
                        color: root.colors.base05
                        font.family: root.fontsConfig ? root.fontsConfig.defaultFamily : "JetBrainsMono Nerd Font Propo"
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
                            color: isFocusedIcon ? root.colors.base0D : root.colors.base05
                            font.pixelSize: root.workspacesConfig.iconFontSize
                            font.family: root.fontsConfig ? root.fontsConfig.defaultFamily : "JetBrainsMono Nerd Font Propo"
                            visible: iconText.length > 0
                            anchors.verticalCenter: parent ? parent.verticalCenter : undefined
                        }
                    }
                }

                MouseArea {
                    anchors.fill: parent
                    hoverEnabled: true
                    onContainsMouseChanged: workspaceDelegate.hovered = containsMouse
                    onClicked: {
                        if (root.workspaceService)
                            root.workspaceService.switchWorkspace(workspaceDelegate.switchTarget);
                    }
                }
            }
        }
    }
}
