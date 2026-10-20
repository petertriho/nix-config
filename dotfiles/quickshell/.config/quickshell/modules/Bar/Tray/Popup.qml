pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import Quickshell.Services.SystemTray
import Quickshell.Widgets
import "../../Common"

// Content of the tray popup: the tray items, the title of the hovered item,
// the menu of one item, then the bar modules in the overflow.
//
// Tray item clicks: left = activate (the menu for a menu-only item), right =
// menu, middle = secondary activate. The popup closes after an activation or
// a triggered menu entry.
Column {
    id: root

    property var module

    // Tray item whose menu shows, null for none.
    property var menuItem: null
    // Open submenus from the top level down (QsMenuEntry objects).
    property var menuPath: []
    // Their texts, kept to find the submenu again after a menu rebuild.
    property var menuPathTexts: []
    // Last tray item under the pointer while the pointer is in the icon row.
    property var hoveredItem: null

    readonly property int iconSize: Config.popups.trayIconSize > 0 ? Config.popups.trayIconSize : Config.fonts.defaultSize + Config.popups.trayIconOffset
    readonly property var menuParent: root.menuPath.length > 0 ? root.menuPath[root.menuPath.length - 1] : null
    readonly property var menuModel: root.menuPath.length > 0 ? subOpener.children : rootOpener.children
    readonly property var menuEntries: root.menuModel ? root.menuModel.values : []
    // Until a menu loads, QsMenuOpener.children is one shared empty model, the
    // same one that an opener without a menu returns. A loaded menu has its own.
    readonly property bool menuLoaded: root.menuModel !== noMenu.children
    // A leading column for check marks and icons, when an entry needs one.
    readonly property bool menuHasLead: root.menuEntries.some(e => e.buttonType !== QsMenuButtonType.None || root.menuIcon(e.icon) !== "")
    readonly property bool menuHasChildren: root.menuEntries.some(e => e.hasChildren)
    readonly property int menuLeadWidth: root.menuHasLead ? root.iconSize + 8 : 0
    readonly property int menuTailWidth: root.menuHasChildren ? 20 : 0
    readonly property real menuWidth: {
        let widest = root.menuParent ? menuFont.advanceWidth("󰅁  " + (root.menuParent.text || "")) : 0;
        for (const e of root.menuEntries)
            widest = Math.max(widest, menuFont.advanceWidth(e.text));
        return Math.min(360, Math.max(200, Math.ceil(widest + 16 + root.menuLeadWidth + root.menuTailWidth)));
    }
    // Width of the full-width rows. The hovered title does not count, so
    // hovering never resizes the card. The icon and overflow rows are centered
    // in it, so they stay in place when a menu widens the card.
    readonly property real contentWidth: Math.max(trayRow.implicitWidth, overflowRow.visible ? overflowRow.implicitWidth : 0, root.menuItem ? root.menuWidth : 0)

    function itemTitle(item: var): string {
        return item ? (item.tooltipTitle || item.title || item.id || "") : "";
    }

    // Icon URL of a menu entry, or "" when the icon theme has no such icon:
    // the icon provider would draw a placeholder checkerboard. An icon from
    // the app's own theme path cannot be checked and stays.
    function menuIcon(icon: var): string {
        const prefix = "image://icon/";
        if (!icon)
            return "";
        if (!icon.startsWith(prefix) || icon.includes("?path="))
            return icon;
        return Quickshell.hasThemeIcon(icon.slice(prefix.length)) ? icon : "";
    }

    function toggleMenu(item: var): void {
        root.menuPath = [];
        root.menuItem = root.menuItem === item ? null : item;
    }

    function activateEntry(entry: var): void {
        if (entry.hasChildren) {
            root.menuPath = root.menuPath.concat([entry]);
            return;
        }
        entry.triggered();
        Popups.close();
    }

    spacing: Config.popups.itemSpacing

    // The root opener holds the menu while a submenu shows: without a
    // reference, Quickshell drops the whole menu tree, submenus included.
    QsMenuOpener {
        id: rootOpener
        menu: root.menuItem ? root.menuItem.menu : null
    }

    QsMenuOpener {
        id: subOpener
        menu: root.menuParent
    }

    QsMenuOpener {
        id: noMenu
    }

    onMenuPathChanged: root.menuPathTexts = root.menuPath.map(e => e.text)

    // An app that rebuilds its menu with new item ids (nm-applet after a Wi-Fi
    // scan, Chromium, Electron) deletes the open submenu entries, and the opener
    // drops its menu. The rebuilt entries are already in place then, so the
    // first submenu level is looked up again by its text: a deeper path ends at
    // that level. Without a match the top level shows.
    Connections {
        target: subOpener
        function onMenuChanged() {
            if (subOpener.menu || root.menuPath.length === 0)
                return;
            const text = root.menuPathTexts[0];
            const entry = rootOpener.children.values.find(e => e.hasChildren && e.text === text);
            root.menuPath = entry ? [entry] : [];
        }
    }

    // An app that quits deletes its menu handle: close its menu.
    Connections {
        target: rootOpener
        function onMenuChanged() {
            if (!rootOpener.menu && root.menuItem) {
                root.menuPath = [];
                root.menuItem = null;
            }
        }
    }

    FontMetrics {
        id: menuFont
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
    }

    Row {
        id: trayRow
        x: (root.contentWidth - width) / 2
        spacing: Config.popups.itemSpacing
        visible: SystemTray.items.values.length > 0

        HoverHandler {
            onHoveredChanged: {
                if (!hovered)
                    root.hoveredItem = null;
            }
        }

        Repeater {
            model: SystemTray.items
            delegate: Item {
                id: trayCell

                required property var modelData

                width: root.iconSize + 16
                height: root.iconSize + 16

                Rectangle {
                    anchors.fill: parent
                    radius: Config.style.radiusSmall
                    color: trayMouse.containsMouse || root.menuItem === trayCell.modelData ? Config.style.hoverColor : "transparent"
                }

                IconImage {
                    anchors.centerIn: parent
                    implicitSize: root.iconSize
                    source: trayCell.modelData.icon
                }

                MouseArea {
                    id: trayMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
                    onContainsMouseChanged: {
                        if (containsMouse)
                            root.hoveredItem = trayCell.modelData;
                    }
                    onClicked: function (mouse) {
                        const item = trayCell.modelData;
                        if (mouse.button === Qt.MiddleButton) {
                            item.secondaryActivate();
                            Popups.close();
                        } else if (mouse.button === Qt.RightButton) {
                            if (item.hasMenu)
                                root.toggleMenu(item);
                        } else if (item.onlyMenu && item.hasMenu) {
                            root.toggleMenu(item);
                        } else {
                            item.activate();
                            Popups.close();
                        }
                    }
                }
            }
        }
    }

    // Title of the hovered item, or of the item whose menu shows.
    Text {
        width: root.contentWidth
        visible: text !== ""
        text: root.itemTitle(root.hoveredItem || root.menuItem)
        horizontalAlignment: Text.AlignHCenter
        color: Config.colors.base04
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
        elide: Text.ElideRight
    }

    Column {
        width: root.contentWidth
        visible: !!root.menuItem

        Rectangle {
            width: parent.width
            height: 1
            color: Config.style.borderColor
        }

        Item {
            width: 1
            height: 4
        }

        // Back to the parent menu.
        Rectangle {
            width: parent.width
            height: backText.implicitHeight + 8
            visible: !!root.menuParent
            radius: Config.style.radiusSmall
            color: backMouse.containsMouse ? Config.style.hoverColor : "transparent"

            Text {
                id: backText
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.leftMargin: 8
                anchors.rightMargin: 8
                anchors.verticalCenter: parent.verticalCenter
                text: "󰅁  " + (root.menuParent ? root.menuParent.text || "" : "")
                color: Config.colors.base04
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize
                font.bold: true
                elide: Text.ElideRight
            }

            MouseArea {
                id: backMouse
                anchors.fill: parent
                hoverEnabled: true
                onClicked: root.menuPath = root.menuPath.slice(0, -1)
            }
        }

        // The menu loads over D-Bus after it is requested.
        Text {
            width: parent.width
            height: implicitHeight + 8
            visible: root.menuEntries.length === 0
            leftPadding: 8
            verticalAlignment: Text.AlignVCenter
            text: root.menuLoaded ? "Empty menu" : "Loading menu…"
            color: Config.colors.base03
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize
        }

        Repeater {
            model: root.menuModel
            delegate: Item {
                id: entry

                required property var modelData
                required property int index
                readonly property bool separator: entry.modelData.isSeparator
                readonly property bool clickable: !entry.separator && entry.modelData.enabled
                readonly property bool checkable: entry.modelData.buttonType !== QsMenuButtonType.None
                readonly property string iconSource: root.menuIcon(entry.modelData.icon)

                width: root.contentWidth
                height: entry.separator ? 9 : Math.max(entryText.implicitHeight, root.iconSize) + 8
                // No separator at the start, at the end or after another one.
                visible: !entry.separator || (entry.index > 0 && entry.index < root.menuEntries.length - 1 && !root.menuEntries[entry.index - 1].isSeparator)

                Rectangle {
                    visible: entry.separator
                    x: 8
                    width: parent.width - 16
                    height: 1
                    anchors.verticalCenter: parent.verticalCenter
                    color: Config.style.borderColor
                }

                Rectangle {
                    anchors.fill: parent
                    visible: entry.clickable
                    radius: Config.style.radiusSmall
                    color: entryMouse.containsMouse ? Config.style.hoverColor : "transparent"
                }

                // Check mark, or the entry icon.
                Text {
                    x: 8
                    width: root.iconSize
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !entry.separator && entry.checkable
                    horizontalAlignment: Text.AlignHCenter
                    text: {
                        const checked = entry.modelData.checkState === Qt.Checked;
                        if (entry.modelData.buttonType === QsMenuButtonType.RadioButton)
                            return checked ? "󰐾" : "󰐽";
                        return checked ? "󰄲" : entry.modelData.checkState === Qt.PartiallyChecked ? "󰡖" : "󰄱";
                    }
                    color: entry.modelData.checkState === Qt.Unchecked ? Config.colors.base04 : Config.style.accentColor
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.fonts.defaultSize
                }

                IconImage {
                    x: 8
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !entry.separator && !entry.checkable && entry.iconSource !== ""
                    implicitSize: root.iconSize
                    source: entry.iconSource
                }

                Text {
                    id: entryText
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.leftMargin: 8 + root.menuLeadWidth
                    anchors.rightMargin: 8 + root.menuTailWidth
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !entry.separator
                    text: entry.modelData.text
                    color: entry.clickable ? Config.colors.base05 : Config.colors.base03
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.fonts.defaultSize
                    elide: Text.ElideRight
                }

                Text {
                    anchors.right: parent.right
                    anchors.rightMargin: 8
                    anchors.verticalCenter: parent.verticalCenter
                    visible: !entry.separator && entry.modelData.hasChildren
                    text: "󰅂"
                    color: entry.clickable ? Config.colors.base04 : Config.colors.base03
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.fonts.defaultSize
                }

                MouseArea {
                    id: entryMouse
                    anchors.fill: parent
                    enabled: entry.clickable
                    hoverEnabled: true
                    onClicked: root.activateEntry(entry.modelData)
                }
            }
        }
    }

    // Right-side bar modules hidden to make room for the centered clock. A
    // click does what a click on the module in the bar does.
    Row {
        id: overflowRow
        x: (root.contentWidth - width) / 2
        spacing: Config.popups.itemSpacing
        visible: root.module.hiddenIds.length > 0

        Repeater {
            model: root.module.hiddenIds
            delegate: Item {
                id: overflowItem

                required property string modelData
                readonly property var mod: root.module.idMap[overflowItem.modelData]

                width: overflowContent.width + 16
                height: Config.fonts.defaultSize + 12

                Rectangle {
                    anchors.fill: parent
                    radius: Config.style.radiusSmall
                    color: overflowMouse.containsMouse ? Config.style.hoverColor : "transparent"
                }

                Row {
                    id: overflowContent
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.left: parent.left
                    anchors.leftMargin: 8
                    spacing: 6

                    Text {
                        text: overflowItem.mod ? overflowItem.mod.text : ""
                        color: Config.colors.base05
                        font.family: Config.fonts.defaultFamily
                        font.pixelSize: Config.fonts.defaultSize
                    }

                    Text {
                        text: root.module.overflowNames[overflowItem.modelData] || overflowItem.modelData
                        color: Config.colors.base05
                        font.family: Config.fonts.defaultFamily
                        font.pixelSize: Config.fonts.defaultSize
                    }
                }

                MouseArea {
                    id: overflowMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    acceptedButtons: Qt.LeftButton | Qt.RightButton
                    onClicked: function (mouse) {
                        // A popup module replaces this popup, so two overlays
                        // never stack. Any other click closes it first.
                        if (overflowItem.mod)
                            overflowItem.mod.handleClick(mouse.button);
                    }
                }
            }
        }
    }
}
