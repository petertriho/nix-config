import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Wayland

// CodexBarPanel — full-screen overlay (mirrors NotificationCenter.qml) listing
// every normalized usage row. Quota rows (Codex/z.ai) render a primary (5h) and
// secondary (weekly/monthly) UsageMeter, each with its own reset countdown, plus
// any free Codex reset credits; cost rows (OpenRouter) render a credits-used
// meter + balance/total/used; error rows show a clean message. Footer = Refresh.
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
                color: colors.fg
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
                        spacing: 6

                        // Title: provider · account
                        Text {
                            Layout.fillWidth: true
                            text: model.label || model.provider
                            color: colors.fg
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize
                            font.bold: true
                            elide: Text.ElideRight
                        }

                        // Primary (5h) meter — quota rows
                        UsageMeter {
                            Layout.fillWidth: true
                            visible: model.kind === "quota"
                            labelText: model.windowLabel
                            percent: model.percent
                            resetShort: model.resetShort
                            resetFull: model.resetFull
                            colors: root.colors
                            fontsConfig: root.fontsConfig
                        }

                        // Secondary (weekly/monthly) meter — quota rows
                        UsageMeter {
                            Layout.fillWidth: true
                            visible: model.kind === "quota" && model.secondaryPercent >= 0
                            labelText: model.secondaryLabel.length > 0 ? model.secondaryLabel : "2nd window"
                            percent: model.secondaryPercent
                            resetShort: model.secondaryResetShort
                            resetFull: model.secondaryResetFull
                            colors: root.colors
                            fontsConfig: root.fontsConfig
                        }

                        // Codex free rate-limit reset credits (quota rows only)
                        Text {
                            Layout.fillWidth: true
                            visible: model.kind === "quota" && model.resetCredits > 0
                            text: model.resetCredits + " reset credits available"
                            color: colors.comment
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 2
                        }

                        // Credits-used meter — cost rows (OpenRouter)
                        UsageMeter {
                            Layout.fillWidth: true
                            visible: model.kind === "cost"
                            labelText: "Credits"
                            percent: model.percent
                            showReset: false
                            colors: root.colors
                            fontsConfig: root.fontsConfig
                        }

                        // Balance / total / used figures — cost rows
                        RowLayout {
                            Layout.fillWidth: true
                            visible: model.kind === "cost"
                            spacing: 8

                            Text {
                                text: (model.creditsBalance.length > 0 && model.creditsTotal.length > 0)
                                    ? model.creditsBalance + " of " + model.creditsTotal
                                    : (model.creditsBalance || model.cost || "—")
                                color: colors.fg
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize - 2
                                Layout.fillWidth: true
                                elide: Text.ElideRight
                            }

                            Text {
                                visible: model.creditsUsed.length > 0
                                text: model.creditsUsed
                                color: colors.fg
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize - 2
                            }
                        }

                        // Error message
                        Text {
                            Layout.fillWidth: true
                            visible: model.kind === "error"
                            text: model.message
                            color: colors.fg
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            wrapMode: Text.WordWrap
                            elide: Text.ElideRight
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
