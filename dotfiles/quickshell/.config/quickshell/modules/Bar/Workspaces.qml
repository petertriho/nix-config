pragma ComponentBehavior: Bound

import QtQuick
import Quickshell
import "../Common"
import "workspaces"

// Workspace pills of an output. A click switches the workspace. On niri, a
// hover opens the mini-map of the workspace, a right click opens the
// workspace menu, and the wheel switches the workspace on the focused output.
Item {
    id: root
    implicitWidth: workspaceRow.implicitWidth
    implicitHeight: Config.workspaces.height

    property string outputName: ""
    // The binding reads the service caches inside workspacesForOutput(), so it
    // updates on every workspace or window change.
    readonly property var workspacesData: WorkspaceService.workspacesForOutput(root.outputName)
    readonly property bool niri: WorkspaceService.compositorName === "niri"
    // Hyprland reports no focused output, so every Hyprland bar counts as
    // focused.
    readonly property bool outputFocused: WorkspaceService.focusedOutput === "" || WorkspaceService.focusedOutput === root.outputName

    // The pill under the sliding underline. A pill sets itself when it
    // becomes active.
    property var activePill: null

    // Mini-map. `hoveredPill` is the pill under the pointer, `mapPill` the
    // pill whose mini-map is open, and `mapHovered` is true while the pointer
    // is on the card.
    property var hoveredPill: null
    property var mapPill: null
    property bool mapHovered: false
    // The card starts at the bottom of the pill, so that the pointer stays on
    // the popup surface on its way to the card. The card itself starts
    // `style.gap` below the bar, as the other popups do.
    readonly property real mapOffset: root.height - workspaceRow.y - workspaceRow.height + Config.style.gap

    // Workspace menu. BarPopup reads `popupKey`, `available`, `visible` and
    // `barWindow`.
    readonly property var barWindow: QsWindow.window
    readonly property string popupKey: root.barWindow && root.barWindow.screen ? root.barWindow.screen.name + ":workspaces" : ""
    readonly property bool popupOpen: root.popupKey !== "" && Popups.active === root.popupKey
    readonly property bool available: true
    property var menuPill: null
    readonly property var menuWorkspace: root.menuPill ? root.menuPill.modelData : null

    // One workspace per wheel notch (120 units). Touchpad deltas accumulate
    // until they reach a notch.
    property real wheelRemainder: 0

    function setActivePill(pill: var): void {
        if (root.activePill === pill)
            return;
        // Slide only from one pill to another. The first pill of a bar puts
        // the underline in place.
        indicator.sliding = root.activePill !== null;
        slideTimer.restart();
        root.activePill = pill;
    }

    function canShowMap(pill: var): bool {
        return root.niri && !!pill && !pill.empty && Popups.active === "";
    }

    // A move from one pill to another changes an open mini-map at once.
    function pillHoverChanged(pill: var, hovered: bool): void {
        if (hovered) {
            root.hoveredPill = pill;
            mapCloseTimer.stop();
            if (root.mapPill !== null)
                root.mapPill = root.canShowMap(pill) ? pill : null;
            if (root.mapPill === null)
                mapOpenTimer.restart();
        } else if (root.hoveredPill === pill) {
            root.hoveredPill = null;
            mapOpenTimer.stop();
            mapCloseTimer.restart();
        }
    }

    function setMapHovered(hovered: bool): void {
        root.mapHovered = hovered;
        if (hovered)
            mapCloseTimer.stop();
        else
            mapCloseTimer.restart();
    }

    function hideMap(): void {
        mapOpenTimer.stop();
        mapCloseTimer.stop();
        root.mapPill = null;
    }

    // A right click on the pill of the open menu closes it.
    function toggleMenu(pill: var): void {
        if (root.popupOpen && root.menuPill === pill) {
            Popups.close();
            return;
        }
        root.menuPill = pill;
        Popups.open(root.popupKey);
    }

    // A new card is not under the pointer yet.
    onMapPillChanged: root.mapHovered = false

    // An open popup or drawer covers the card.
    Connections {
        target: Popups

        function onActiveChanged(): void {
            if (Popups.active !== "")
                root.hideMap();
        }
    }

    Timer {
        id: mapOpenTimer
        interval: Config.workspaces.hoverDelayMs
        onTriggered: {
            if (root.canShowMap(root.hoveredPill))
                root.mapPill = root.hoveredPill;
        }
    }

    Timer {
        id: mapCloseTimer
        interval: Config.workspaces.hoverGraceMs
        onTriggered: {
            if (root.hoveredPill === null && !root.mapHovered)
                root.mapPill = null;
        }
    }

    // Down is the next workspace. Only on the focused output: niri moves the
    // pointer to the center of an output that gets the focus from an action.
    WheelHandler {
        enabled: root.niri && root.outputName === WorkspaceService.focusedOutput
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
        onEnabledChanged: root.wheelRemainder = 0
        onWheel: function (event) {
            root.wheelRemainder += event.angleDelta.y;
            while (Math.abs(root.wheelRemainder) >= 120) {
                const direction = root.wheelRemainder > 0 ? -1 : 1;
                WorkspaceService.focusWorkspaceRelative(direction);
                root.wheelRemainder += direction * 120;
            }
        }
    }

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
                readonly property bool empty: !!pill.modelData.empty
                readonly property string label: {
                    const name = pill.modelData.name || "";
                    const max = Config.workspaces.nameMaxChars;
                    return name.length > max ? name.slice(0, max - 1) + "…" : name;
                }
                // An urgent workspace takes the urgent color even when it is
                // active. The output without the focus mutes its active
                // workspace.
                readonly property color labelColor: {
                    if (pill.urgent)
                        return Config.colors.base08;
                    if (pill.active && root.outputFocused)
                        return Config.style.accentColor;
                    if (pill.empty && !pill.active)
                        return Config.colors.base03;
                    return Config.colors.base05;
                }

                implicitWidth: Math.max(Config.workspaces.baseWidth, pillRow.implicitWidth + Config.module.widthPadding)
                implicitHeight: Config.workspaces.height
                radius: Config.style.radiusSmall
                color: pillMouse.containsMouse || (root.popupOpen && root.menuPill === pill) ? Config.style.hoverColor : "transparent"

                onActiveChanged: {
                    if (pill.active)
                        root.setActivePill(pill);
                }
                onEmptyChanged: {
                    if (pill.empty && root.mapPill === pill)
                        root.hideMap();
                }
                Component.onCompleted: {
                    if (pill.active)
                        root.setActivePill(pill);
                }
                // A menu or a card of a workspace that is gone closes.
                Component.onDestruction: {
                    if (root.activePill === pill)
                        root.activePill = null;
                    if (root.hoveredPill === pill)
                        root.hoveredPill = null;
                    if (root.mapPill === pill)
                        root.hideMap();
                    if (root.menuPill === pill) {
                        root.menuPill = null;
                        if (root.popupOpen)
                            Popups.close();
                    }
                }

                Behavior on implicitWidth {
                    NumberAnimation {
                        duration: Config.workspaces.animationMs
                        easing.type: Easing.OutCubic
                    }
                }
                Behavior on color {
                    ColorAnimation {
                        duration: Config.workspaces.animationMs
                    }
                }

                Row {
                    id: pillRow
                    anchors.centerIn: parent
                    spacing: Config.workspaces.spacing

                    Text {
                        anchors.verticalCenter: parent.verticalCenter
                        text: pill.label
                        color: pill.labelColor
                        font.family: Config.fonts.defaultFamily
                        font.pixelSize: Config.workspaces.fontSize

                        Behavior on color {
                            ColorAnimation {
                                duration: Config.workspaces.animationMs
                            }
                        }
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
                            color: windowIcon.modelData.urgent ? Config.colors.base08 : windowIcon.modelData.focused && root.outputFocused ? Config.style.accentColor : Config.colors.base05
                            font.family: Config.fonts.defaultFamily
                            font.pixelSize: Config.workspaces.iconFontSize

                            Behavior on color {
                                ColorAnimation {
                                    duration: Config.workspaces.animationMs
                                }
                            }
                        }
                    }

                    // Windows after the first `maxIcons`.
                    Text {
                        anchors.verticalCenter: parent.verticalCenter
                        visible: pill.modelData.hiddenCount > 0
                        text: "+" + pill.modelData.hiddenCount
                        color: Config.colors.base03
                        font.family: Config.fonts.defaultFamily
                        font.pixelSize: Config.workspaces.fontSize
                    }
                }

                // Marks an urgent workspace. The sliding underline hides while
                // the active workspace is urgent.
                Rectangle {
                    id: urgentLine
                    anchors.left: parent.left
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    anchors.leftMargin: Config.style.radiusSmall
                    anchors.rightMargin: Config.style.radiusSmall
                    height: 2
                    radius: 1
                    color: Config.colors.base08
                    visible: pill.urgent

                    // Runs only while the workspace is urgent. A stop ends the
                    // loop at full opacity.
                    SequentialAnimation on opacity {
                        running: pill.urgent && pill.visible
                        loops: Animation.Infinite
                        alwaysRunToEnd: true

                        NumberAnimation {
                            to: 0.35
                            duration: 600
                            easing.type: Easing.InOutSine
                        }
                        NumberAnimation {
                            to: 1
                            duration: 600
                            easing.type: Easing.InOutSine
                        }
                    }
                }

                MouseArea {
                    id: pillMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    acceptedButtons: Qt.LeftButton | Qt.RightButton
                    onContainsMouseChanged: root.pillHoverChanged(pill, pillMouse.containsMouse)
                    onClicked: function (mouse) {
                        root.hideMap();
                        if (mouse.button === Qt.RightButton && root.niri) {
                            root.toggleMenu(pill);
                            return;
                        }
                        // An open popup keeps the keyboard focus.
                        Popups.close();
                        if (mouse.button === Qt.LeftButton)
                            WorkspaceService.switchWorkspace(pill.modelData.switchTarget);
                    }
                }

                LazyLoader {
                    active: root.mapPill === pill

                    PopupWindow {
                        anchor.item: pill
                        anchor.edges: Edges.Bottom
                        anchor.gravity: Edges.Bottom
                        anchor.adjustment: PopupAdjustment.Slide
                        visible: true
                        color: "transparent"
                        implicitWidth: mapCard.implicitWidth
                        implicitHeight: root.mapOffset + mapCard.implicitHeight

                        Item {
                            anchors.fill: parent

                            HoverHandler {
                                id: mapHover
                                onHoveredChanged: root.setMapHovered(mapHover.hovered)
                            }

                            WorkspaceMiniMap {
                                id: mapCard
                                y: root.mapOffset
                                width: mapCard.implicitWidth
                                height: mapCard.implicitHeight
                                workspaceId: pill.modelData.id
                                onWindowClicked: function (windowId) {
                                    WorkspaceService.focusWindow(windowId);
                                    root.hideMap();
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Underline of the active workspace. It slides when the active workspace
    // changes, and follows its pill directly otherwise, so that it does not
    // lag while the pill widths animate.
    Rectangle {
        id: indicator

        readonly property var target: root.activePill
        property bool sliding: false

        x: indicator.target ? workspaceRow.x + indicator.target.x + Config.style.radiusSmall : 0
        y: workspaceRow.y + workspaceRow.height - indicator.height
        width: indicator.target ? Math.max(0, indicator.target.width - Config.style.radiusSmall * 2) : 0
        height: 2
        radius: 1
        color: root.outputFocused ? Config.style.accentColor : Config.colors.base04
        visible: !!indicator.target && indicator.target.active && !indicator.target.urgent

        Behavior on x {
            enabled: indicator.sliding

            NumberAnimation {
                duration: Config.workspaces.indicatorAnimationMs
                easing.type: Easing.OutCubic
            }
        }
        Behavior on width {
            enabled: indicator.sliding

            NumberAnimation {
                duration: Config.workspaces.indicatorAnimationMs
                easing.type: Easing.OutCubic
            }
        }
        Behavior on color {
            ColorAnimation {
                duration: Config.workspaces.animationMs
            }
        }
    }

    // Ends the slide a little after the animation, so that a running
    // animation is never cut off.
    Timer {
        id: slideTimer
        interval: Config.workspaces.indicatorAnimationMs + 30
        onTriggered: indicator.sliding = false
    }

    BarPopup {
        module: root
        anchorItem: root.menuPill
        preferredWidth: 260

        WorkspaceMenu {
            module: root
        }
    }
}
