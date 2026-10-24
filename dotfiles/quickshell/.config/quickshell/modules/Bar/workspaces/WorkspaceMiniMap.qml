pragma ComponentBehavior: Bound

import QtQuick
import "../../Common"

// Mini-map of a niri workspace for the hover card of a pill. It draws the
// columns to scale, with the glyph and the title of each window, and the
// floating windows as chips under the columns. A tabbed column is one frame
// with a row for each tab. A click on a tile, a tab or a chip emits
// `windowClicked`.
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

    // One window: a tile in a column, a tab in a tabbed column, or a
    // floating chip. A tab has no frame of its own, and a bar on its left
    // marks it.
    component WindowCell: Rectangle {
        id: cell

        required property var window
        property bool tab: false
        // The tab bar and the space after it.
        readonly property int inset: cell.tab ? 6 : 0
        readonly property bool showTitle: cell.width - cell.inset >= Config.workspaces.mapTitleMinWidth

        implicitWidth: cellIcon.implicitWidth + cellTitle.implicitWidth + 14
        radius: Config.style.radiusSmall
        color: cellMouse.containsMouse ? Config.style.hoverColor : cell.tab ? "transparent" : Config.style.cardColor
        border.width: cell.tab ? 0 : 1
        border.color: cell.window.urgent ? Config.colors.base08 : cell.window.focused ? Config.style.accentColor : Config.style.borderColor
        clip: true

        Rectangle {
            visible: cell.tab
            x: 2
            anchors.verticalCenter: parent.verticalCenter
            width: 2
            height: Math.max(2, cell.height - 4)
            radius: 1
            color: cell.window.urgent ? Config.colors.base08 : cell.window.focused ? Config.style.accentColor : Config.colors.base03
        }

        Row {
            anchors.verticalCenter: parent.verticalCenter
            x: cell.showTitle ? cell.inset + 5 : cell.inset + Math.max(0, (cell.width - cell.inset - width) / 2)
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
                width: Math.max(0, cell.width - cell.inset - cellIcon.implicitWidth - 14)
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

    // A tabbed column: one frame, with the tabs in equal rows.
    component TabbedColumn: Rectangle {
        id: tabs

        required property var tiles
        readonly property int inner: 2
        readonly property real rowHeight: (tabs.height - tabs.inner * 2 - (tabs.tiles.length - 1)) / Math.max(1, tabs.tiles.length)

        radius: Config.style.radiusSmall
        color: Config.style.cardColor
        border.width: 1
        border.color: tabs.tiles.some(tile => tile.urgent) ? Config.colors.base08 : tabs.tiles.some(tile => tile.focused) ? Config.style.accentColor : Config.style.borderColor
        clip: true

        Column {
            x: tabs.inner
            y: tabs.inner
            width: tabs.width - tabs.inner * 2
            spacing: 1

            Repeater {
                model: tabs.tiles

                delegate: WindowCell {
                    id: tabCell

                    required property var modelData

                    window: tabCell.modelData
                    tab: true
                    width: tabs.width - tabs.inner * 2
                    height: Math.max(4, tabs.rowHeight)
                }
            }
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

                delegate: Item {
                    id: column

                    required property var modelData
                    readonly property bool tabbed: !!column.modelData.tabbed
                    readonly property real tilesHeight: Config.workspaces.mapHeight - root.spacing * (column.modelData.tiles.length - 1)

                    width: Math.max(root.minColumnWidth, column.modelData.width * root.map.scale)
                    height: Config.workspaces.mapHeight

                    Column {
                        visible: !column.tabbed
                        spacing: root.spacing

                        Repeater {
                            model: column.tabbed ? [] : column.modelData.tiles

                            delegate: WindowCell {
                                id: tile

                                required property var modelData

                                window: tile.modelData
                                width: column.width
                                height: Math.max(4, tile.modelData.fraction * column.tilesHeight)
                            }
                        }
                    }

                    TabbedColumn {
                        visible: column.tabbed
                        anchors.fill: parent
                        tiles: column.tabbed ? column.modelData.tiles : []
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
