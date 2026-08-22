import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Wayland
import "../Common"

// Panel — full-screen overlay (mirrors Center.qml) listing
// every normalized usage row. Quota rows render up to three compacted source
// windows, each with reset and pacing details plus an expected-usage marker, and
// any free Codex reset credits. Cost rows (OpenRouter) render a credits-used
// meter + balance/total/used; error rows show a clean message. Footer = Refresh.
OverlayHost {
    id: root

    required property var usageModel
    property bool busy
    required property QtObject colors
    required property QtObject fontsConfig
    property QtObject overlayConfig

    animationDurationMs: overlayConfig ? overlayConfig.animationDurationMs : 180
    closeGraceMs: overlayConfig ? overlayConfig.closeGraceMs : 220

    signal refreshRequested

    readonly property int drawerWidth: 420
    readonly property int padding: 12
    // Footer: last-updated time + auto-refresh cadence.
    property string lastUpdated: ""
    property int refreshIntervalSec: 300
    // The drawer drops just below the bar (config.codexbar.topMargin =
    // bar.height + 12, mirroring notifications.topMargin) so it never overlaps it.
    required property int topMargin
    readonly property int bottomMargin: 12
    // A ListView has no intrinsic height, so size it explicitly (mirrors
    // Center.qml) — Layout.fillHeight alone yields 0 and hides rows.
    readonly property int maxPanelHeight: Math.max(160, Screen.height - root.topMargin - root.bottomMargin)
    readonly property int maxListHeight: Math.max(120, root.maxPanelHeight - 104)
    readonly property real listHeight: usageModel.count > 0 ? Math.min(listView.contentHeight, root.maxListHeight) : 0

    Rectangle {
        id: drawer
        width: root.drawerWidth
        height: Math.min(column.implicitHeight + root.padding * 2, root.maxPanelHeight)
        x: root.width - width - 12
        y: root.topMargin
        radius: 10
        color: colors.base01
        border.color: colors.base10

        // Popover settle: fade + slight scale from the top-right corner. Avoids the
        // horizontal slide (which depended on root.width and traveled across-screen).
        opacity: root.open ? 1.0 : 0.0
        scale: root.open ? 1.0 : 0.97
        transformOrigin: Item.TopRight

        Behavior on opacity {
            NumberAnimation { duration: root.animationDurationMs; easing.type: root.open ? Easing.OutCubic : Easing.InCubic }
        }
        Behavior on scale {
            NumberAnimation { duration: root.animationDurationMs; easing.type: root.open ? Easing.OutCubic : Easing.InCubic }
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
                    color: colors.base06
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize + 2
                    font.bold: true
                    Layout.fillWidth: true
                }

                Text {
                    text: root.busy ? "󰇦" : "󰑐"
                    color: refreshMouse.containsMouse ? colors.base0D : colors.base03
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
                    color: closeMouse.containsMouse ? colors.base08 : colors.base03
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
                color: colors.base02
            }

            // Empty state
            Text {
                visible: usageModel.count === 0
                text: root.busy ? "Fetching…" : "No usage data yet.\nConfigure a provider: codexbar config enable --provider <name>"
                color: colors.base05
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
                            color: colors.base05
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize
                            font.bold: true
                            elide: Text.ElideRight
                        }

                        // First available quota window
                        UsageMeter {
                            Layout.fillWidth: true
                            visible: model.kind === "quota"
                            labelText: model.windowLabel
                            percent: model.percent
                            resetShort: model.resetShort
                            resetFull: model.resetFull
                            paceExpectedPercent: model.paceExpectedPercent
                            paceState: model.paceState
                            paceSummary: model.paceSummary
                            paceProjection: model.paceProjection
                            colors: root.colors
                            fontsConfig: root.fontsConfig
                        }

                        // Second available quota window
                        UsageMeter {
                            Layout.fillWidth: true
                            visible: model.kind === "quota" && model.secondaryPercent >= 0
                            labelText: model.secondaryLabel.length > 0 ? model.secondaryLabel : "2nd window"
                            percent: model.secondaryPercent
                            resetShort: model.secondaryResetShort
                            resetFull: model.secondaryResetFull
                            paceExpectedPercent: model.secondaryPaceExpectedPercent
                            paceState: model.secondaryPaceState
                            paceSummary: model.secondaryPaceSummary
                            paceProjection: model.secondaryPaceProjection
                            colors: root.colors
                            fontsConfig: root.fontsConfig
                        }

                        // Third available quota window
                        UsageMeter {
                            Layout.fillWidth: true
                            visible: model.kind === "quota" && model.tertiaryPercent >= 0
                            labelText: model.tertiaryLabel.length > 0 ? model.tertiaryLabel : "3rd window"
                            percent: model.tertiaryPercent
                            resetShort: model.tertiaryResetShort
                            resetFull: model.tertiaryResetFull
                            paceExpectedPercent: model.tertiaryPaceExpectedPercent
                            paceState: model.tertiaryPaceState
                            paceSummary: model.tertiaryPaceSummary
                            paceProjection: model.tertiaryPaceProjection
                            colors: root.colors
                            fontsConfig: root.fontsConfig
                        }

                        // Codex free rate-limit reset credits + their expiry
                        // times, one compact line (quota rows only)
                        Text {
                            Layout.fillWidth: true
                            visible: model.kind === "quota"
                                && model.resetCreditSummary.length > 0
                            text: model.resetCreditSummary
                            color: colors.base03
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 2
                            wrapMode: Text.WordWrap
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
                                color: colors.base05
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize - 2
                                Layout.fillWidth: true
                                elide: Text.ElideRight
                            }

                            Text {
                                visible: model.creditsUsed.length > 0
                                text: model.creditsUsed
                                color: colors.base05
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize - 2
                            }
                        }

                        // Error message
                        Text {
                            Layout.fillWidth: true
                            visible: model.kind === "error"
                            text: model.message
                            color: colors.base05
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
                color: colors.base03
                font.family: fontsConfig.defaultFamily
                font.pixelSize: fontsConfig.defaultSize - 2
                horizontalAlignment: Text.AlignRight
            }
        }
    }
}
