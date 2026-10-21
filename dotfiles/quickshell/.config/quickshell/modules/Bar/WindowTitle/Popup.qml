pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import "../../Common"
import "../workspaces"
import "../workspaces/workspaceHelpers.js" as WorkspaceHelpers

// Window menu of the title. An item focuses the window that the title shows,
// runs the niri action of the matching key binding (home/programs/niri.nix)
// and closes the menu.
Column {
    id: root

    property var module
    readonly property var window: root.module ? root.module.window : null
    readonly property string appId: root.window ? root.window.app_id || "" : ""
    readonly property bool floating: !!root.window && root.window.is_floating

    // Items ({icon, label, action, color}) and separators. The list depends
    // only on the floating state and the screens, so a title change does not
    // make the rows again.
    readonly property var entries: {
        const list = [
            {
                icon: "󰖯",
                label: "Maximize column",
                action: ["maximize-column"]
            },
            {
                icon: "󰊓",
                label: "Fullscreen",
                action: ["fullscreen-window"]
            },
            {
                icon: root.floating ? "󰕭" : "󱂬",
                label: root.floating ? "Tile window" : "Float window",
                action: ["toggle-window-floating"]
            },
            {
                icon: "󰘞",
                label: "Center column",
                action: ["center-column"]
            },
            {
                icon: "󰡎",
                label: "Next column width",
                action: ["switch-preset-column-width"]
            }
        ];
        const others = Quickshell.screens.filter(s => s.name !== (root.module ? root.module.outputName : ""));
        if (others.length > 0)
            list.push({
                separator: true
            });
        for (const screen of others)
            list.push({
                icon: "󱒃",
                label: "Move to " + screen.name,
                action: ["move-window-to-monitor", screen.name]
            });
        list.push({
            separator: true
        });
        list.push({
            icon: "󰅖",
            label: "Close window",
            action: ["close-window"],
            color: Config.colors.base08
        });
        return list;
    }

    function run(action: var): void {
        if (root.window)
            WorkspaceService.windowAction(root.window.id, action);
        Popups.close();
    }

    spacing: Config.popups.itemSpacing

    Text {
        width: root.width
        text: WorkspaceHelpers.getWindowIcon(Config.windowIcons, root.appId) + "  " + root.appId
        color: Config.colors.base04
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
        elide: Text.ElideRight
    }

    // The full title, which the bar cuts off when it is long.
    Text {
        width: root.width
        visible: text !== ""
        text: root.window ? root.window.title || "" : ""
        color: Config.colors.base05
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        wrapMode: Text.Wrap
        maximumLineCount: 3
        elide: Text.ElideRight
    }

    Rectangle {
        width: root.width
        height: 1
        color: Config.style.borderColor
    }

    MenuList {
        width: root.width
        entries: root.entries
        onTriggered: entry => root.run(entry.action)
    }
}
