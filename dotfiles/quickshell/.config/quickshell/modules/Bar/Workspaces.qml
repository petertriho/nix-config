pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import "../Common"
import "workspaces"

Item {
    id: root
    implicitWidth: workspaceRow.implicitWidth
    implicitHeight: Config.workspaces.height

    property string outputName: ""
    // The binding reads the service caches inside workspacesForOutput(), so it
    // updates on every workspace or window change.
    readonly property var workspacesData: WorkspaceService.workspacesForOutput(root.outputName)

    Row {
        id: workspaceRow
        anchors.verticalCenter: parent.verticalCenter
        spacing: Config.workspaces.spacing

        Repeater {
            // Keyed by workspace id: a change (for example a window title)
            // updates the existing pills instead of recreating all of them.
            model: ScriptModel {
                values: root.workspacesData
                objectProp: "id"
            }

            delegate: Rectangle {
                id: pill
                required property var modelData

                readonly property bool active: !!pill.modelData.active
                readonly property bool urgent: !!pill.modelData.urgent
                // An urgent workspace takes the urgent color even when it is active.
                readonly property color accent: pill.urgent ? Config.colors.base08 : Config.style.accentColor

                implicitWidth: Math.max(Config.workspaces.baseWidth, pillRow.implicitWidth + Config.module.widthPadding)
                implicitHeight: Config.workspaces.height
                radius: Config.style.radiusSmall
                color: pillMouse.containsMouse ? Config.style.hoverColor : "transparent"

                Row {
                    id: pillRow
                    anchors.centerIn: parent
                    spacing: Config.workspaces.spacing

                    Text {
                        anchors.verticalCenter: parent.verticalCenter
                        text: pill.modelData.name || ""
                        color: pill.active || pill.urgent ? pill.accent : Config.colors.base05
                        font.family: Config.fonts.defaultFamily
                        font.pixelSize: Config.workspaces.fontSize
                    }

                    Repeater {
                        model: ScriptModel {
                            values: pill.modelData.windowIcons || []
                            objectProp: "id"
                        }

                        delegate: Text {
                            id: windowIcon
                            required property var modelData

                            anchors.verticalCenter: parent ? parent.verticalCenter : undefined
                            visible: windowIcon.text.length > 0
                            text: windowIcon.modelData.icon || ""
                            color: windowIcon.modelData.urgent ? Config.colors.base08 : windowIcon.modelData.focused ? Config.style.accentColor : Config.colors.base05
                            font.family: Config.fonts.defaultFamily
                            font.pixelSize: Config.workspaces.iconFontSize
                        }
                    }
                }

                // Marks the active and the urgent workspaces.
                Rectangle {
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    anchors.leftMargin: Config.style.radiusSmall
                    anchors.rightMargin: Config.style.radiusSmall
                    height: 2
                    radius: 1
                    color: pill.accent
                    visible: pill.active || pill.urgent
                }

                MouseArea {
                    id: pillMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: {
                        // An open popup keeps the keyboard focus.
                        Popups.close();
                        WorkspaceService.switchWorkspace(pill.modelData.switchTarget);
                    }
                }
            }
        }
    }
}
