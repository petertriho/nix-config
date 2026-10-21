pragma ComponentBehavior: Bound

import QtQuick
import "../../Common"

// Mini-map of a niri workspace for the hover card of a pill. It draws the
// columns to scale, with the glyph and the title of each window, and the
// floating windows as chips under the columns. A click on a tile or a chip
// emits `windowClicked`.
Rectangle {
    id: root

    property int workspaceId: -1
    signal windowClicked(var windowId)

    readonly property int padding: 8
    readonly property int spacing: 3
    // A column stays wide enough for its glyph when the scale is small.
    readonly property int minColumnWidth: 14
    readonly property int maxContentWidth: Config.workspaces.mapMaxWidth - root.padding * 2
    readonly property var map: WorkspaceService.workspaceMap(root.workspaceId, {
        maxWidth: root.maxContentWidth,
        height: Config.workspaces.mapHeight,
        spacing: root.spacing
    })
    readonly property var columns: root.map ? root.map.columns : []
    readonly property var floating: root.map ? root.map.floating : []

    function plural(count: int, word: string): string {
        return count + " " + word + (count === 1 ? "" : "s");
    }

    implicitWidth: Math.min(root.maxContentWidth, Math.max(strip.implicitWidth, chips.implicitWidth, footer.implicitWidth)) + root.padding * 2
    implicitHeight: content.implicitHeight + root.padding * 2
    color: Config.style.surfaceColor
    border.width: 1
    border.color: Config.style.borderColor
    radius: Config.style.radius

    // One window: a tile in a column or a floating chip.
    component WindowCell: Rectangle {
        id: cell

        required property var window
        readonly property bool showTitle: cell.width >= Config.workspaces.mapTitleMinWidth

        implicitWidth: cellIcon.implicitWidth + cellTitle.implicitWidth + 14
        radius: Config.style.radiusSmall
        color: cellMouse.containsMouse ? Config.style.hoverColor : Config.style.cardColor
        border.width: 1
        border.color: cell.window.urgent ? Config.colors.base08 : cell.window.focused ? Config.style.accentColor : Config.style.borderColor
        clip: true

        Row {
            anchors.verticalCenter: parent.verticalCenter
            x: cell.showTitle ? 5 : Math.max(0, (cell.width - width) / 2)
            spacing: 4

            Text {
                id: cellIcon
                anchors.verticalCenter: parent.verticalCenter
                text: cell.window.icon
                color: cell.window.urgent ? Config.colors.base08 : cell.window.focused ? Config.style.accentColor : Config.colors.base05
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.workspaces.iconFontSize
            }

            Text {
                id: cellTitle
                anchors.verticalCenter: parent.verticalCenter
                visible: cell.showTitle
                width: Math.max(0, cell.width - cellIcon.implicitWidth - 14)
                text: cell.window.title
                color: Config.colors.base05
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize - 3
                elide: Text.ElideRight
            }
        }

        MouseArea {
            id: cellMouse
            anchors.fill: parent
            hoverEnabled: true
            onClicked: root.windowClicked(cell.window.id)
        }
    }

    Column {
        id: content
        x: root.padding
        y: root.padding
        width: root.width - root.padding * 2
        spacing: 6
        clip: true

        Row {
            id: strip
            visible: root.columns.length > 0
            spacing: root.spacing

            Repeater {
                model: root.columns

                delegate: Column {
                    id: column

                    required property var modelData
                    readonly property real tilesHeight: Config.workspaces.mapHeight - root.spacing * (column.modelData.tiles.length - 1)

                    width: Math.max(root.minColumnWidth, column.modelData.width * root.map.scale)
                    height: Config.workspaces.mapHeight
                    spacing: root.spacing

                    Repeater {
                        model: column.modelData.tiles

                        delegate: WindowCell {
                            id: tile

                            required property var modelData

                            window: tile.modelData
                            width: column.width
                            height: Math.max(4, tile.modelData.fraction * column.tilesHeight)
                        }
                    }
                }
            }
        }

        // Floating windows.
        Row {
            id: chips
            visible: root.floating.length > 0
            spacing: 4

            Text {
                anchors.verticalCenter: parent.verticalCenter
                text: "󱂬"
                color: Config.colors.base04
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.workspaces.iconFontSize
            }

            Repeater {
                model: root.floating

                delegate: WindowCell {
                    id: chip

                    required property var modelData

                    window: chip.modelData
                    width: Math.min(140, chip.implicitWidth)
                    height: 20
                }
            }
        }

        Text {
            id: footer
            text: root.plural(root.map ? root.map.windowCount : 0, "window") + " · " + root.plural(root.map ? root.map.columnCount : 0, "column")
            color: Config.colors.base04
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize - 3
        }
    }
}
