import QtQuick
import QtQuick.Layouts
import "../Common"

// Panel — the "codexbar" drawer (mirrors Center.qml) with one card per
// normalized usage row. Quota rows render up to three compacted source
// windows, each with reset and pacing details plus an expected-usage marker, and
// any free Codex reset credits. Cost rows (OpenRouter) render a credits-used
// meter + balance/total/used; error rows show a clean message. PopupCard
// scrolls the content when it is taller than the screen allows.
OverlayHost {
    id: root

    required property var usageModel
    property bool busy

    signal refreshRequested

    // Footer values: time of the last fetch with data, and the poll interval.
    property string lastUpdated: ""
    property int refreshIntervalSec: 300
    // The drawer drops just below the bar so it never overlaps it.
    readonly property int topMargin: Config.bar.height + Config.style.gap
    readonly property int maxPanelHeight: Math.max(1, Screen.height - root.topMargin - Config.notifications.bottomMargin)

    PopupCard {
        id: drawer
        open: root.open
        preferredWidth: Config.notifications.drawerWidth
        maxHeight: root.maxPanelHeight
        x: root.width - width - Config.style.gap
        y: root.topMargin
        // Popover settle: fade + slight scale from the top-right corner.
        transformOrigin: Item.TopRight

        ColumnLayout {
            id: column
            width: parent.width
            spacing: Config.notifications.spacing

            // Header
            RowLayout {
                Layout.fillWidth: true
                spacing: 10

                Text {
                    text: "Usage"
                    color: Config.colors.base06
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.fonts.defaultSize + 2
                    font.bold: true
                    Layout.fillWidth: true
                }

                Text {
                    text: root.busy ? "󰇦" : "󰑐"
                    color: refreshMouse.containsMouse ? Config.colors.base0D : Config.colors.base03
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.fonts.defaultSize
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
                    color: closeMouse.containsMouse ? Config.colors.base08 : Config.colors.base03
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.fonts.defaultSize
                    Layout.alignment: Qt.AlignVCenter

                    MouseArea {
                        id: closeMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: root.closeRequested()
                    }
                }
            }

            // Empty state
            Text {
                visible: root.usageModel.count === 0
                text: root.busy ? "Fetching…" : "No usage data yet.\nConfigure a provider: codexbar config enable --provider <name>"
                color: Config.colors.base05
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }

            // One card per row, styled like the notification center cards.
            Repeater {
                model: root.usageModel

                delegate: Rectangle {
                    id: card

                    required property var model

                    Layout.fillWidth: true
                    implicitHeight: cardColumn.implicitHeight + Config.style.padding * 2
                    color: Config.style.cardColor
                    radius: Config.style.radiusSmall

                    ColumnLayout {
                        id: cardColumn
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: Config.style.padding
                        spacing: 6

                        // Title: provider · account
                        Text {
                            Layout.fillWidth: true
                            text: card.model.label || card.model.provider
                            color: Config.colors.base05
                            font.family: Config.fonts.defaultFamily
                            font.pixelSize: Config.fonts.defaultSize
                            font.bold: true
                            elide: Text.ElideRight
                        }

                        // First available quota window
                        UsageMeter {
                            Layout.fillWidth: true
                            visible: card.model.kind === "quota"
                            labelText: card.model.windowLabel
                            percent: card.model.percent
                            resetShort: card.model.resetShort
                            resetFull: card.model.resetFull
                            paceExpectedPercent: card.model.paceExpectedPercent
                            paceState: card.model.paceState
                            paceSummary: card.model.paceSummary
                            paceProjection: card.model.paceProjection
                        }

                        // Second available quota window
                        UsageMeter {
                            Layout.fillWidth: true
                            visible: card.model.kind === "quota" && card.model.secondaryPercent >= 0
                            labelText: card.model.secondaryLabel.length > 0 ? card.model.secondaryLabel : "2nd window"
                            percent: card.model.secondaryPercent
                            resetShort: card.model.secondaryResetShort
                            resetFull: card.model.secondaryResetFull
                            paceExpectedPercent: card.model.secondaryPaceExpectedPercent
                            paceState: card.model.secondaryPaceState
                            paceSummary: card.model.secondaryPaceSummary
                            paceProjection: card.model.secondaryPaceProjection
                        }

                        // Third available quota window
                        UsageMeter {
                            Layout.fillWidth: true
                            visible: card.model.kind === "quota" && card.model.tertiaryPercent >= 0
                            labelText: card.model.tertiaryLabel.length > 0 ? card.model.tertiaryLabel : "3rd window"
                            percent: card.model.tertiaryPercent
                            resetShort: card.model.tertiaryResetShort
                            resetFull: card.model.tertiaryResetFull
                            paceExpectedPercent: card.model.tertiaryPaceExpectedPercent
                            paceState: card.model.tertiaryPaceState
                            paceSummary: card.model.tertiaryPaceSummary
                            paceProjection: card.model.tertiaryPaceProjection
                        }

                        // Codex free rate-limit reset credits + their expiry
                        // times, one compact line (quota rows only)
                        Text {
                            Layout.fillWidth: true
                            visible: card.model.kind === "quota" && card.model.resetCreditSummary.length > 0
                            text: card.model.resetCreditSummary
                            color: Config.colors.base03
                            font.family: Config.fonts.defaultFamily
                            font.pixelSize: Config.fonts.defaultSize - 2
                            wrapMode: Text.WordWrap
                        }

                        // Credits-used meter — cost rows (OpenRouter)
                        UsageMeter {
                            Layout.fillWidth: true
                            visible: card.model.kind === "cost"
                            labelText: "Credits"
                            percent: card.model.percent
                            showReset: false
                        }

                        // Balance / total / used figures — cost rows
                        RowLayout {
                            Layout.fillWidth: true
                            visible: card.model.kind === "cost"
                            spacing: 8

                            Text {
                                text: (card.model.creditsBalance.length > 0 && card.model.creditsTotal.length > 0)
                                    ? card.model.creditsBalance + " of " + card.model.creditsTotal
                                    : (card.model.creditsBalance || card.model.cost || "—")
                                color: Config.colors.base05
                                font.family: Config.fonts.defaultFamily
                                font.pixelSize: Config.fonts.defaultSize - 2
                                Layout.fillWidth: true
                                elide: Text.ElideRight
                            }

                            Text {
                                visible: card.model.creditsUsed.length > 0
                                text: card.model.creditsUsed
                                color: Config.colors.base05
                                font.family: Config.fonts.defaultFamily
                                font.pixelSize: Config.fonts.defaultSize - 2
                            }
                        }

                        // Error message
                        Text {
                            Layout.fillWidth: true
                            visible: card.model.kind === "error"
                            text: card.model.message
                            color: Config.colors.base05
                            font.family: Config.fonts.defaultFamily
                            font.pixelSize: Config.fonts.defaultSize - 1
                            wrapMode: Text.WordWrap
                            elide: Text.ElideRight
                        }
                    }
                }
            }

            // Footer: last-updated time + auto-refresh cadence.
            Text {
                Layout.fillWidth: true
                visible: root.usageModel.count > 0
                text: "Updated " + (root.lastUpdated.length > 0 ? root.lastUpdated : "—")
                      + "  ·  auto " + Math.max(1, Math.round(root.refreshIntervalSec / 60)) + "m"
                color: Config.colors.base03
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize - 2
                horizontalAlignment: Text.AlignRight
            }
        }
    }
}
