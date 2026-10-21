pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import "../../Common"

// Workspace menu of a pill (niri only). An item runs a niri action on the
// workspace and closes the menu. "Rename…" turns into a text field: Enter
// sets the name, Enter on an empty field clears it, and Esc ends the edit.
// "Close all windows" needs a second click within `Config.workspaces.confirmMs`.
Column {
    id: root

    // The Workspaces module.
    property var module
    readonly property var workspace: root.module ? root.module.menuWorkspace : null
    readonly property int workspaceId: root.workspace ? root.workspace.id : -1
    readonly property var workspaces: root.module ? root.module.workspacesData : []
    readonly property int position: root.workspaces.findIndex(ws => ws.id === root.workspaceId)
    readonly property var windowIds: {
        const map = WorkspaceService.workspaceMap(root.workspaceId, null);
        if (!map)
            return [];
        const ids = map.floating.map(entry => entry.id);
        for (const column of map.columns)
            for (const tile of column.tiles)
                ids.push(tile.id);
        return ids;
    }

    // Niri removes an empty workspace without a name as soon as it is not
    // active, so a move of it changes nothing.
    readonly property bool movable: !!root.workspace && (!root.workspace.empty || root.workspace.named)
    readonly property bool canMoveLeft: root.movable && root.position > 0
    // A move to the right of the trailing empty workspaces changes nothing:
    // niri adds a new empty workspace after the moved one and removes the old.
    readonly property bool canMoveRight: root.movable && root.workspaces.slice(root.position + 1).some(ws => !ws.empty || ws.named)

    property bool renaming: false
    property bool armed: false

    readonly property var entries: {
        const ws = root.workspace;
        if (!ws)
            return [];
        const list = [];
        if (!root.renaming)
            list.push({
                icon: "󰑕",
                label: "Rename…",
                action: "rename"
            });
        if (ws.named)
            list.push({
                icon: "󰫌",
                label: "Clear name",
                action: "clear"
            });
        list.push({
            separator: true
        });
        list.push({
            icon: "󰁍",
            label: "Move left",
            action: "left",
            disabled: !root.canMoveLeft
        });
        list.push({
            icon: "󰁔",
            label: "Move right",
            action: "right",
            disabled: !root.canMoveRight
        });
        const others = Quickshell.screens.filter(s => s.name !== root.module.outputName);
        if (others.length > 0)
            list.push({
                separator: true
            });
        for (const screen of others)
            list.push({
                icon: "󱒃",
                label: "Move to " + screen.name,
                action: "monitor",
                output: screen.name,
                disabled: !root.movable
            });
        list.push({
            separator: true
        });
        const count = root.windowIds.length;
        list.push({
            icon: "󰱞",
            label: root.armed ? "Click again to close " + count + (count === 1 ? " window" : " windows") : "Close all windows",
            action: "close",
            color: Config.colors.base08,
            disabled: count === 0
        });
        return list;
    }

    // A right click on another pill moves the menu to that workspace.
    onWorkspaceIdChanged: {
        root.endRename();
        root.armed = false;
    }

    function startRename(): void {
        root.renaming = true;
        nameInput.text = root.workspace.named ? root.workspace.name : "";
        nameInput.selectAll();
        nameInput.forceActiveFocus();
    }

    // The menu takes the focus back from the field, so that Esc closes it.
    function endRename(): void {
        root.renaming = false;
        root.forceActiveFocus();
    }

    function applyName(): void {
        const ws = root.workspace;
        if (!ws)
            return;
        const name = nameInput.text.trim();
        if (name === "") {
            if (ws.named)
                WorkspaceService.unsetWorkspaceName(ws.reference);
        } else if (!ws.named || name !== ws.name) {
            WorkspaceService.setWorkspaceName(ws.reference, name);
        }
        Popups.close();
    }

    function run(entry: var): void {
        const ws = root.workspace;
        if (!ws)
            return;
        switch (entry.action) {
        case "rename":
            root.startRename();
            return;
        case "clear":
            WorkspaceService.unsetWorkspaceName(ws.reference);
            break;
        case "left":
            WorkspaceService.moveWorkspaceToIndex(ws.reference, ws.idx - 1);
            break;
        case "right":
            WorkspaceService.moveWorkspaceToIndex(ws.reference, ws.idx + 1);
            break;
        case "monitor":
            WorkspaceService.moveWorkspaceToMonitor(ws.reference, entry.output);
            break;
        case "close":
            if (!root.armed) {
                root.armed = true;
                confirmTimer.restart();
                return;
            }
            WorkspaceService.closeWindows(root.windowIds);
            break;
        }
        Popups.close();
    }

    spacing: Config.popups.itemSpacing
    Keys.onEscapePressed: Popups.close()

    Timer {
        id: confirmTimer
        interval: Config.workspaces.confirmMs
        onTriggered: root.armed = false
    }

    Text {
        width: root.width
        text: !root.workspace ? "" : root.workspace.named ? root.workspace.name : "Workspace " + root.workspace.idx
        color: Config.colors.base05
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        elide: Text.ElideRight
    }

    Text {
        width: root.width
        text: root.windowIds.length + (root.windowIds.length === 1 ? " window" : " windows") + " · " + (root.module ? root.module.outputName : "")
        color: Config.colors.base04
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
        elide: Text.ElideRight
    }

    Rectangle {
        width: root.width
        height: 1
        color: Config.style.borderColor
    }

    // Takes the place of the "Rename…" item while the name is edited.
    Rectangle {
        width: root.width
        height: nameInput.implicitHeight + 10
        visible: root.renaming
        radius: Config.style.radiusSmall
        color: Config.style.cardColor
        border.width: 1
        border.color: Config.style.accentColor

        TextInput {
            id: nameInput
            anchors.fill: parent
            anchors.leftMargin: 8
            anchors.rightMargin: 8
            verticalAlignment: TextInput.AlignVCenter
            color: Config.colors.base05
            selectionColor: Config.style.accentColor
            selectedTextColor: Config.colors.base00
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize
            clip: true
            Keys.onReturnPressed: root.applyName()
            Keys.onEnterPressed: root.applyName()
            Keys.onEscapePressed: root.endRename()
        }

        Text {
            anchors.fill: nameInput
            verticalAlignment: Text.AlignVCenter
            visible: nameInput.text === ""
            text: "Name (empty clears it)"
            color: Config.colors.base03
            font: nameInput.font
        }
    }

    MenuList {
        width: root.width
        entries: root.entries
        onTriggered: entry => root.run(entry)
    }
}
