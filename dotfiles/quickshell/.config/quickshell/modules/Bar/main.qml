import QtQuick
import Quickshell
import "../Common"
import "workspaces"

PanelWindow {
    id: root
    visible: true
    // focusable: true
    color: "transparent"
    anchors {
        top: true
        left: true
        right: true
    }
    implicitHeight: Config.bar.height
    exclusiveZone: Config.bar.exclusiveZone

    // The popup of a module in the tray overflow opens under this item.
    readonly property Item overflowAnchor: tray

    Rectangle {
        anchors.fill: parent
        color: Config.colors.base01
        opacity: 1.0

        Item {
            anchors.fill: parent
            anchors.leftMargin: Config.bar.contentMargins
            anchors.rightMargin: Config.bar.contentMargins

            // A click on the bar background closes any popup or drawer.
            MouseArea {
                anchors.fill: parent
                z: -1
                onClicked: Popups.close()
            }

            // Left modules
            VicinaeButton {
                id: applicationsLauncher
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                height: parent.height
                icon: "󰀻"
                url: "vicinae://launch/applications"
                accentColor: Config.colors.base0D
            }

            Workspaces {
                id: workspaces
                anchors.left: applicationsLauncher.right
                anchors.leftMargin: Config.bar.moduleSpacing
                anchors.verticalCenter: parent.verticalCenter
                height: parent.height
                outputName: root.screen ? root.screen.name : ""
            }

            WindowTitle {
                id: windowTitle
                anchors.left: workspaces.right
                anchors.leftMargin: Config.bar.moduleSpacing
                anchors.verticalCenter: parent.verticalCenter
                width: Math.max(0, clock.x - Config.bar.clockGap - windowTitle.x)
                height: parent.height
                title: WorkspaceService.activeWindowTitleForOutput(root.screen ? root.screen.name : "")
            }

            // Center modules
            Clock {
                id: clock
                anchors.centerIn: parent
            }

            // Right modules
            Row {
                id: rightRow
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: Config.bar.moduleSpacing
                height: parent.height

                // config key → module object. Keep in sync with the valid-key
                // list in Config.qml's bar.rightHidePriority comment.
                // ("audio" key → pulseaudio id; "power" → powerManagementLauncher.)
                readonly property var idMap: ({
                    "tray": tray, "caffeine": caffeine, "stats": stats,
                    "backlight": backlight, "audio": pulseaudio, "battery": battery,
                    "bluetooth": bluetooth, "network": network, "codexbar": codexbar,
                    "notifications": notifications, "power": powerManagementLauncher
                })
                // Display name shown for a module in the tray overflow.
                readonly property var overflowNames: ({
                    "stats": "Stats", "codexbar": "Codex", "caffeine": "Caffeine",
                    "backlight": "Brightness", "battery": "Battery",
                    "bluetooth": "Bluetooth", "audio": "Audio", "network": "Network"
                })
                // Width used for the fit calculation. Modules set implicitWidth
                // via BaseModule; fall back to .width for anything that doesn't.
                function widthOf(it) {
                    return (it && it.implicitWidth > 0) ? it.implicitWidth : (it ? it.width : 0);
                }
                // Only available modules take space. The tray always does: its
                // availability depends on hiddenIds, so reading it here would
                // make a binding loop.
                function takesSpace(key) {
                    const it = rightRow.idMap[key];
                    return !!it && (key === "tray" || it.available);
                }
                // Prefix of rightHidePriority that must hide for the visible
                // modules to fit the space left of the centered clock. Pure
                // function of module implicitWidths + availability + clock.x +
                // clockGap: hiding a module does not change its implicitWidth,
                // so the hiddenIds binding cannot oscillate. Unavailable
                // modules are left out, so the tray overflow never lists them.
                function computeHiddenIds() {
                    const prio = Config.bar.rightHidePriority || [];
                    // clock.x isn't laid out yet (startup) → hide nothing.
                    // (Once laid out clock.x > 0; the loop below returns all
                    // of prio if even hiding everything can't fit.)
                    if (clock.x <= 0)
                        return [];
                    const budget = clock.x - Config.bar.clockGap;
                    const listed = {};
                    for (const key of prio)
                        listed[key] = true;
                    // never-hidden (unlisted) modules always reserve their width
                    let rw = 0;
                    let rn = 0;
                    for (const key in rightRow.idMap)
                        if (!listed[key] && rightRow.takesSpace(key)) {
                            rw += rightRow.widthOf(rightRow.idMap[key]);
                            rn++;
                        }
                    for (let c = 0; c <= prio.length; c++) {
                        let w = rw;
                        let n = rn;
                        for (let j = c; j < prio.length; j++) {
                            if (rightRow.takesSpace(prio[j])) {
                                w += rightRow.widthOf(rightRow.idMap[prio[j]]);
                                n++;
                            }
                        }
                        if (w + Math.max(0, n - 1) * Config.bar.moduleSpacing <= budget)
                            return prio.slice(0, c).filter(rightRow.takesSpace);
                    }
                    return prio.filter(rightRow.takesSpace);
                }
                readonly property var hiddenIds: rightRow.computeHiddenIds()

                // A module shows when it is available and not in the tray overflow.
                function isShown(key) {
                    const it = rightRow.idMap[key];
                    return !!it && it.available && rightRow.hiddenIds.indexOf(key) < 0;
                }

                Tray {
                    id: tray
                    visible: rightRow.isShown("tray")
                    height: parent.height
                    hiddenIds: rightRow.hiddenIds
                    idMap: rightRow.idMap
                    overflowNames: rightRow.overflowNames
                }

                Caffeine {
                    id: caffeine
                    visible: rightRow.isShown("caffeine")
                    height: parent.height
                }

                Stats {
                    id: stats
                    visible: rightRow.isShown("stats")
                    height: parent.height
                }

                Backlight {
                    id: backlight
                    visible: rightRow.isShown("backlight")
                    height: parent.height
                }

                Audio {
                    id: pulseaudio
                    visible: rightRow.isShown("audio")
                    height: parent.height
                }

                Battery {
                    id: battery
                    visible: rightRow.isShown("battery")
                    height: parent.height
                }

                Bluetooth {
                    id: bluetooth
                    visible: rightRow.isShown("bluetooth")
                    height: parent.height
                }

                Network {
                    id: network
                    visible: rightRow.isShown("network")
                    height: parent.height
                }

                CodexBar {
                    id: codexbar
                    visible: rightRow.isShown("codexbar")
                    height: parent.height
                }

                Notifications {
                    id: notifications
                    visible: rightRow.isShown("notifications")
                    height: parent.height
                }

                VicinaeButton {
                    id: powerManagementLauncher
                    visible: rightRow.isShown("power")
                    height: parent.height
                    icon: "󰐥"
                    url: "vicinae://launch/power"
                    accentColor: Config.colors.base08
                }
            }
        }
    }
}
