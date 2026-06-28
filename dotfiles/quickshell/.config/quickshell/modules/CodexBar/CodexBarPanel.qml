import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Wayland

// CodexBarPanel — full-screen overlay (mirrors NotificationCenter.qml) listing
// every normalized usage row: quota rows (Codex/z.ai) show primary % + secondary
// % + reset countdown with a colored meter; cost rows (OpenRouter) show spend;
// error rows show a clean message. Footer has a manual Refresh button.
PanelWindow {
    id: root

    required property var usageModel
    property var mostCriticalRow
    property bool busy
    required property QtObject colors
    required property QtObject fontsConfig

    property bool open: false
    signal closeRequested
    signal refreshRequested

    readonly property int drawerWidth: 420
    readonly property int padding: 12
    // Footer: last-updated time + auto-refresh cadence.
    property string lastUpdated: ""
    property int refreshIntervalSec: 300
    // The bar owns the top strip (config.bar.height = 28). Drop the drawer just
    // below it so the panel never overlaps the bar (mirrors notifications.topMargin).
    readonly property int barHeight: 28
    readonly property int bottomMargin: 12
    readonly property int topMargin: root.barHeight + 12
    // A ListView has no intrinsic height, so size it explicitly (mirrors
    // NotificationCenter.qml) — Layout.fillHeight alone yields 0 and hides rows.
    readonly property int maxPanelHeight: Math.max(160, Screen.height - root.topMargin - root.bottomMargin)
    readonly property int maxListHeight: Math.max(120, root.maxPanelHeight - 104)
    readonly property real listHeight: usageModel.count > 0 ? Math.min(listView.contentHeight, root.maxListHeight) : 0

    visible: root.open || drawer.opacity > 0
    color: "transparent"
    exclusiveZone: -1
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: open ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None
    onVisibleChanged: if (visible)
        backdrop.forceActiveFocus()

    anchors {
        top: true
        bottom: true
        left: true
        right: true
    }

    function bandColor(percent) {
        if (percent < 0 || isNaN(percent))
            return colors.comment;
        if (percent >= 90)
            return colors.red;
        if (percent >= 70)
            return colors.yellow;
        return colors.green;
    }

    // Backdrop: click outside or Esc closes.
    MouseArea {
        id: backdrop
        anchors.fill: parent
        z: -1
        focus: true
        Keys.onEscapePressed: root.closeRequested()
        onClicked: root.closeRequested()
    }

    Rectangle {
        id: drawer
        width: root.drawerWidth
        height: Math.min(column.implicitHeight + root.padding * 2, root.maxPanelHeight)
        x: root.width - width - 12
        y: root.topMargin
        radius: 10
        color: colors.bg
        border.color: colors.border

        // Popover settle: fade + slight scale from the top-right corner. Avoids the
        // horizontal slide (which depended on root.width and traveled across-screen).
        opacity: root.open ? 1.0 : 0.0
        scale: root.open ? 1.0 : 0.97
        transformOrigin: Item.TopRight

        Behavior on opacity {
            NumberAnimation { duration: 180; easing.type: root.open ? Easing.OutCubic : Easing.InCubic }
        }
        Behavior on scale {
            NumberAnimation { duration: 180; easing.type: root.open ? Easing.OutCubic : Easing.InCubic }
        }

        ColumnLayout {
            id: column
            anchors.fill: parent
            anchors.margins: root.padding
            spacing: 8

            // Header
            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                Text {
                    text: "Usage"
                    color: colors.fg_float
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize + 2
                    font.bold: true
                    Layout.fillWidth: true
                }

                Text {
                    text: root.busy ? "󰇦" : "󰑐"
                    color: refreshMouse.containsMouse ? colors.blue : colors.comment
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    Layout.alignment: Qt.AlignVCenter

                    MouseArea {
                        id: refreshMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: root.refreshRequested()
                    }
                }

                Text {
                    text: "󰅖"
                    color: closeMouse.containsMouse ? colors.red : colors.comment
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    Layout.alignment: Qt.AlignVCenter

                    MouseArea {
                        id: closeMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: root.closeRequested()
                    }
                }
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 1
                color: colors.bg_highlight
            }

            // Empty state
            Text {
                visible: usageModel.count === 0
                text: root.busy ? "Fetching…" : "No usage data yet.\nConfigure a provider: codexbar config enable --provider <name>"
                color: colors.comment
                font.family: fontsConfig.defaultFamily
                font.pixelSize: fontsConfig.defaultSize
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }

            // Rows
            ListView {
                id: listView
                Layout.fillWidth: true
                Layout.preferredHeight: root.listHeight
                visible: usageModel.count > 0
                model: usageModel
                spacing: 8
                clip: true

                delegate: Rectangle {
                    width: ListView.view.width
                    height: delegateCol.implicitHeight
                    color: "transparent"
                    radius: 6

                    ColumnLayout {
                        id: delegateCol
                        anchors.left: parent.left
                        anchors.right: parent.right
                        spacing: 3

                        // Label + value
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 8

                            Text {
                                text: model.label || model.provider
                                color: colors.fg
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize
                                elide: Text.ElideRight
                                Layout.fillWidth: true
                            }

                            Text {
                                visible: model.kind === "quota"
                                text: model.percent >= 0 ? Math.round(model.percent) + "%" : "—"
                                color: root.bandColor(model.percent)
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize
                                font.bold: true
                            }

                            Text {
                                visible: model.kind === "cost"
                                text: model.cost || "—"
                                color: colors.green
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize
                                font.bold: true
                            }

                            Text {
                                visible: model.kind === "error"
                                text: "—"
                                color: colors.comment
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize
                            }
                        }

                        // Window label + secondary % (quota only)
                        RowLayout {
                            Layout.fillWidth: true
                            visible: model.kind === "quota"
                            spacing: 8

                            Text {
                                text: model.windowLabel
                                color: colors.comment
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize - 1
                                Layout.fillWidth: true
                                elide: Text.ElideRight
                            }

                            Text {
                                visible: model.secondaryPercent >= 0
                                text: (model.secondaryLabel || "2nd") + " " + Math.round(model.secondaryPercent) + "%"
                                color: colors.comment
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize - 1
                            }
                        }

                        // Reset countdown (quota only)
                        Text {
                            Layout.fillWidth: true
                            visible: model.kind === "quota"
                            text: "resets " + model.resetShort + "  ·  " + model.resetFull
                            color: colors.comment
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 2
                        }

                        // Error message
                        Text {
                            Layout.fillWidth: true
                            visible: model.kind === "error"
                            text: model.message
                            color: colors.comment
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            wrapMode: Text.WordWrap
                            elide: Text.ElideRight
                        }

                        // Meter bar (quota only)
                        Rectangle {
                            Layout.fillWidth: true
                            visible: model.kind === "quota"
                            Layout.preferredHeight: 4
                            radius: 2
                            color: colors.bg_highlight

                            Rectangle {
                                width: parent.width * (model.percent < 0 ? 0 : Math.min(100, model.percent)) / 100
                                height: parent.height
                                radius: parent.radius
                                color: root.bandColor(model.percent)
                            }
                        }
                    }
                }
            }

            // Footer: last-updated time + auto-refresh cadence.
            Text {
                Layout.fillWidth: true
                visible: usageModel.count > 0
                text: "Updated " + (root.lastUpdated.length > 0 ? root.lastUpdated : "—")
                      + "  ·  auto " + Math.max(1, Math.round(root.refreshIntervalSec / 60)) + "m"
                color: colors.comment
                font.family: fontsConfig.defaultFamily
                font.pixelSize: fontsConfig.defaultSize - 2
                horizontalAlignment: Text.AlignRight
            }
        }
    }
}
