import QtQuick
import Quickshell
import "../Common"
import "../ControlOSD" as Osd

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
    // The modules at both ends of the bar reach into the bar margins up to the
    // screen edges. They fill the margins with padding, so that their hover
    // highlight and click area reach the corners.
    readonly property int edgeOverhang: Config.bar.contentMargins

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
                anchors.leftMargin: -root.edgeOverhang
                anchors.verticalCenter: parent.verticalCenter
                height: parent.height
                extraPadding: root.edgeOverhang
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
                // As wide as the text, so that the hover highlight and the
                // menu fit it. At most up to the stats. When they are hidden,
                // up to the right Row (the OSD then covers part of the title
                // while it shows).
                width: Math.min(windowTitle.implicitWidth, Math.max(0, (stats.visible ? (parent.width - stats.fitWidth) / 2 : rightRow.x) - Config.bar.centerGap - windowTitle.x))
                height: parent.height
                outputName: root.screen ? root.screen.name : ""
            }

            // Center module. Its width follows its values.
            Stats {
                id: stats
                anchors.centerIn: parent
                visible: rightRow.isShown("stats")
                height: parent.height
            }

            // Volume and brightness OSD over the center of the bar. The bar
            // color behind it covers the stats, or the window title when the
            // stats are hidden.
            Rectangle {
                id: osd
                anchors.centerIn: parent
                // Covers the stats completely.
                width: Math.max(Config.osd.barWidth, stats.visible ? stats.width : 0)
                height: parent.height
                color: Config.colors.base01
                opacity: Osd.OsdService.shown ? 1 : 0
                visible: opacity > 0

                Behavior on opacity {
                    NumberAnimation {
                        duration: Config.overlay.animationDurationMs
                    }
                }

                Osd.MiniOsd {
                    anchors.fill: parent
                    anchors.leftMargin: Config.module.contentMargins
                    anchors.rightMargin: Config.module.contentMargins
                }

                // One step per wheel notch (120 units). Touchpad deltas
                // accumulate until they reach a notch.
                property real wheelRemainder: 0
                onVisibleChanged: osd.wheelRemainder = 0

                WheelHandler {
                    acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
                    onWheel: function (event) {
                        osd.wheelRemainder += event.angleDelta.y;
                        while (Math.abs(osd.wheelRemainder) >= 120) {
                            const direction = osd.wheelRemainder > 0 ? 1 : -1;
                            Osd.OsdService.step(direction);
                            osd.wheelRemainder -= direction * 120;
                        }
                    }
                }
            }

            // Right modules
            Row {
                id: rightRow
                anchors.right: parent.right
                anchors.rightMargin: -root.edgeOverhang
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
                    "notifications": notifications, "power": powerManagementLauncher,
                    "clock": clock
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
                // Prefix of rightHidePriority that must hide for the right Row
                // to end `centerGap` before the center: before the stats (at
                // their widest) when they show, else before the OSD. Pure
                // function of module implicitWidths, availability and the bar
                // width: hiding a module does not change its implicitWidth, so
                // the hiddenIds binding cannot oscillate. Unavailable modules
                // are left out, so the tray overflow never lists them.
                function computeHiddenIds() {
                    const prio = Config.bar.rightHidePriority || [];
                    const barWidth = rightRow.parent.width;
                    // Not laid out yet (startup) → hide nothing.
                    if (barWidth <= 0)
                        return [];
                    const listed = {};
                    for (const key of prio)
                        listed[key] = true;
                    // never-hidden (unlisted) modules of the Row always reserve their width
                    let rw = 0;
                    let rn = 0;
                    for (const key in rightRow.idMap)
                        if (key !== "stats" && !listed[key] && rightRow.takesSpace(key)) {
                            rw += rightRow.widthOf(rightRow.idMap[key]);
                            rn++;
                        }
                    for (let c = 0; c <= prio.length; c++) {
                        let w = rw;
                        let n = rn;
                        const statsShown = rightRow.takesSpace("stats") && (!listed["stats"] || prio.indexOf("stats") >= c);
                        for (let j = c; j < prio.length; j++) {
                            if (prio[j] !== "stats" && rightRow.takesSpace(prio[j])) {
                                w += rightRow.widthOf(rightRow.idMap[prio[j]]);
                                n++;
                            }
                        }
                        const centerHalf = Math.max(statsShown ? stats.fitWidth : 0, Config.osd.barWidth) / 2;
                        const budget = barWidth / 2 + root.edgeOverhang - centerHalf - Config.bar.centerGap;
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

                Clock {
                    id: clock
                    visible: rightRow.isShown("clock")
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
                    extraPadding: root.edgeOverhang
                    icon: "󰐥"
                    url: "vicinae://launch/power"
                    accentColor: Config.colors.base08
                }
            }
        }
    }
}
