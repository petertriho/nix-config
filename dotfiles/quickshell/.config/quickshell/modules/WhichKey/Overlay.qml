pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Wayland
import "../Common"
import "../Bar/workspaces"
import "whichKeyHelpers.js" as WhichKeyHelpers

// The which-key box in the bottom-right corner of the focused screen. It
// takes no keyboard focus and no pointer input, so niri and the focused
// window get every key and click.
PanelWindow {
    id: root

    readonly property int padding: Config.style.padding
    readonly property int rowHeight: Math.ceil(metrics.height) + Config.whichKey.rowSpacing
    // The screen height without the bar, the screen-edge margins, the card
    // padding and the title.
    readonly property real availableHeight: (root.screen ? root.screen.height : 0) - Config.bar.height - Config.style.gap * 2 - root.padding * 2 - title.implicitHeight - Config.whichKey.titleSpacing
    readonly property int rowsPerColumn: Math.max(1, Math.floor((root.availableHeight + Config.whichKey.rowSpacing) / root.rowHeight))
    readonly property var columns: WhichKeyHelpers.columns(WhichKeyService.rows, root.rowsPerColumn)

    // The focused niri output. Without a match, the primary screen, which Qt
    // lists first.
    screen: {
        const name = WorkspaceService.focusedOutput;
        const screens = Quickshell.screens;
        for (let i = 0; i < screens.length; i++) {
            if (screens[i].name === name)
                return screens[i];
        }
        return screens.length > 0 ? screens[0] : null;
    }

    visible: WhichKeyService.shown && WhichKeyService.layerName !== ""
    color: "transparent"
    exclusiveZone: -1
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.namespace: "quickshell-whichkey"
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    anchors {
        bottom: true
        right: true
    }
    margins {
        bottom: Config.style.gap
        right: Config.style.gap
    }
    implicitWidth: card.width
    implicitHeight: card.height

    // An empty input region: clicks go to the windows below.
    mask: Region {}

    FontMetrics {
        id: metrics
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.whichKey.fontSize
    }

    Rectangle {
        id: card
        width: content.implicitWidth + root.padding * 2
        height: content.implicitHeight + root.padding * 2
        color: Config.style.surfaceColor
        border.width: 1
        border.color: Config.style.borderColor
        radius: Config.style.radius

        Column {
            id: content
            x: root.padding
            y: root.padding
            spacing: Config.whichKey.titleSpacing

            Text {
                id: title
                anchors.horizontalCenter: parent.horizontalCenter
                text: WhichKeyService.layerName
                color: Config.colors.base05
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.whichKey.fontSize
                font.bold: true
            }

            Text {
                visible: WhichKeyService.rows.length === 0
                anchors.horizontalCenter: parent.horizontalCenter
                text: "No binds"
                color: Config.colors.base04
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.whichKey.fontSize
            }

            Row {
                visible: WhichKeyService.rows.length > 0
                spacing: Config.whichKey.columnSpacing

                Repeater {
                    model: root.columns

                    delegate: GridLayout {
                        id: column

                        required property var modelData

                        columns: 2
                        columnSpacing: Config.whichKey.keySpacing
                        rowSpacing: Config.whichKey.rowSpacing

                        Repeater {
                            model: WhichKeyHelpers.gridCells(column.modelData)

                            delegate: Text {
                                id: cell

                                required property var modelData

                                text: cell.modelData.text
                                color: cell.modelData.isKey ? Config.style.accentColor : cell.modelData.isGroup ? Config.colors.base0E : Config.colors.base05
                                font.family: Config.fonts.defaultFamily
                                font.pixelSize: Config.whichKey.fontSize
                                // JetBrains Mono draws "/=" in "-/=" as one "≠" glyph.
                                font.features: ({
                                        "liga": 0,
                                        "calt": 0
                                    })
                                Layout.alignment: Qt.AlignVCenter
                            }
                        }
                    }
                }
            }
        }
    }
}
