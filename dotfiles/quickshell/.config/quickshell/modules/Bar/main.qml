import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Hyprland
import "../Common"

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
    implicitHeight: barConfig.height
    exclusiveZone: barConfig.exclusiveZone

    property QtObject colors
    property QtObject barConfig
    property QtObject moduleConfig
    property QtObject workspacesConfig
    property QtObject intervalsConfig
    property QtObject thresholdsConfig
    property QtObject stepsConfig
    property QtObject fontsConfig
    property QtObject popupsConfig
    property QtObject overlayConfig
    required property var notificationsManager
    property var codexBarService
    property var workspaceService

    Rectangle {
        anchors.fill: parent
        color: colors.base01
        opacity: 1.0

        Item {
            anchors.fill: parent
            anchors.leftMargin: barConfig.contentMargins
            anchors.rightMargin: barConfig.contentMargins

            MouseArea {
                anchors.fill: parent
                z: -1
                onClicked: {
                    caffeine.closePopup();
                    tray.closePopup();
                    stats.closePopup();
                    bluetooth.closePopup();
                    battery.closePopup();
                    clock.closePopup();
                    if (notificationsManager)
                        notificationsManager.hideCenter();
                    if (codexBarService)
                        codexBarService.hidePanel();
                }
            }

            // Left modules
            VicinaeButton {
                id: applicationsLauncher
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                height: parent.height
                colors: root.colors
                moduleConfig: root.moduleConfig
                fontsConfig: root.fontsConfig
                icon: "󰀻"
                url: "vicinae://launch/applications"
                accentColor: colors.base0D
            }

            Workspaces {
                id: workspaces
                anchors.left: applicationsLauncher.right
                anchors.leftMargin: barConfig.moduleSpacing
                anchors.verticalCenter: parent.verticalCenter
                height: parent.height
                colors: root.colors
                workspacesConfig: root.workspacesConfig
                fontsConfig: root.fontsConfig
                outputName: root.screen ? root.screen.name : ""
                workspaceService: root.workspaceService
            }

            WindowTitle {
                id: windowTitle
                anchors.left: workspaces.right
                anchors.leftMargin: root.barConfig ? root.barConfig.moduleSpacing : 0
                anchors.verticalCenter: parent.verticalCenter
                width: Math.max(0, clock.x - (root.barConfig ? root.barConfig.clockGap : 0) - windowTitle.x)
                height: parent.height
                colors: root.colors
                moduleConfig: root.moduleConfig
                fontsConfig: root.fontsConfig
                title: root.workspaceService ? root.workspaceService.activeWindowTitleForOutput(root.screen ? root.screen.name : "") : ""
            }

            // Center modules
            Clock {
                id: clock
                anchors.centerIn: parent
                barWindow: root
                colors: root.colors
                moduleConfig: root.moduleConfig
                intervalsConfig: root.intervalsConfig
                fontsConfig: root.fontsConfig
                popupsConfig: root.popupsConfig
                overlayConfig: root.overlayConfig
            }

            // Right modules
            Row {
                id: rightRow
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: barConfig.moduleSpacing
                height: parent.height

                // config key → module object. Keep in sync with the valid-key
                // list in config.qml's bar.rightHidePriority comment.
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
                // Prefix of rightHidePriority that must hide for the visible
                // modules to fit the space left of the centered clock. Pure
                // function of module implicitWidths + clock.x + clockGap:
                // hiding a module does not change its implicitWidth, so the
                // hiddenIds binding cannot oscillate.
                function computeHiddenIds() {
                    var prio = barConfig.rightHidePriority || [];
                    // clock.x isn't laid out yet (startup) → hide nothing.
                    // (Once laid out clock.x > 0; the loop below returns all
                    // of prio if even hiding everything can't fit.)
                    if (clock.x <= 0)
                        return [];
                    var budget = clock.x - barConfig.clockGap;
                    var listed = {};
                    for (var i = 0; i < prio.length; i++)
                        listed[prio[i]] = true;
                    // never-hidden (unlisted) modules always reserve their width
                    var rw = 0, rn = 0;
                    for (var k in idMap)
                        if (!listed[k]) {
                            rw += widthOf(idMap[k]);
                            rn++;
                        }
                    for (var c = 0; c <= prio.length; c++) {
                        var w = rw, n = rn;
                        for (var j = c; j < prio.length; j++) {
                            var it = idMap[prio[j]];
                            if (it) {
                                w += widthOf(it);
                                n++;
                            }
                        }
                        if (w + Math.max(0, n - 1) * barConfig.moduleSpacing <= budget)
                            return prio.slice(0, c);
                    }
                    return prio.slice();
                }
                readonly property var hiddenIds: computeHiddenIds()

                Tray {
                    id: tray
                    height: parent.height
                    barWindow: root
                    hiddenIds: rightRow.hiddenIds
                    idMap: rightRow.idMap
                    overflowNames: rightRow.overflowNames
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    fontsConfig: root.fontsConfig
                    popupsConfig: root.popupsConfig
                    overlayConfig: root.overlayConfig
                }

                Caffeine {
                    id: caffeine
                    visible: rightRow.hiddenIds.indexOf("caffeine") < 0
                    height: parent.height
                    barWindow: root
                    inOverflow: rightRow.hiddenIds.indexOf("caffeine") >= 0
                    overflowAnchorModule: tray
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    fontsConfig: root.fontsConfig
                    popupsConfig: root.popupsConfig
                    overlayConfig: root.overlayConfig
                }

                Stats {
                    id: stats
                    visible: rightRow.hiddenIds.indexOf("stats") < 0
                    height: parent.height
                    barWindow: root
                    inOverflow: rightRow.hiddenIds.indexOf("stats") >= 0
                    overflowAnchorModule: tray
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    intervalsConfig: root.intervalsConfig
                    thresholdsConfig: root.thresholdsConfig
                    fontsConfig: root.fontsConfig
                    popupsConfig: root.popupsConfig
                    overlayConfig: root.overlayConfig
                }

                Backlight {
                    id: backlight
                    visible: rightRow.hiddenIds.indexOf("backlight") < 0
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    intervalsConfig: root.intervalsConfig
                    thresholdsConfig: root.thresholdsConfig
                    fontsConfig: root.fontsConfig
                }

                Audio {
                    id: pulseaudio
                    visible: rightRow.hiddenIds.indexOf("audio") < 0
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    intervalsConfig: root.intervalsConfig
                    thresholdsConfig: root.thresholdsConfig
                    stepsConfig: root.stepsConfig
                    fontsConfig: root.fontsConfig
                }

                Battery {
                    id: battery
                    visible: battery.hasBattery && rightRow.hiddenIds.indexOf("battery") < 0
                    height: parent.height
                    barWindow: root
                    inOverflow: rightRow.hiddenIds.indexOf("battery") >= 0
                    overflowAnchorModule: tray
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    intervalsConfig: root.intervalsConfig
                    thresholdsConfig: root.thresholdsConfig
                    fontsConfig: root.fontsConfig
                    popupsConfig: root.popupsConfig
                    overlayConfig: root.overlayConfig
                }

                Bluetooth {
                    id: bluetooth
                    visible: rightRow.hiddenIds.indexOf("bluetooth") < 0
                    height: parent.height
                    barWindow: root
                    inOverflow: rightRow.hiddenIds.indexOf("bluetooth") >= 0
                    overflowAnchorModule: tray
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    fontsConfig: root.fontsConfig
                    popupsConfig: root.popupsConfig
                    overlayConfig: root.overlayConfig
                }

                Network {
                    id: network
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    intervalsConfig: root.intervalsConfig
                    fontsConfig: root.fontsConfig
                }

                CodexBar {
                    id: codexbar
                    visible: codexbar.configured && rightRow.hiddenIds.indexOf("codexbar") < 0
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    fontsConfig: root.fontsConfig
                    codexBarService: root.codexBarService
                }

                Notifications {
                    id: notifications
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    fontsConfig: root.fontsConfig
                    notificationsManager: root.notificationsManager
                }

                VicinaeButton {
                    id: powerManagementLauncher
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    fontsConfig: root.fontsConfig
                    icon: "󰐥"
                    url: "vicinae://launch/power"
                    accentColor: colors.base08
                }
            }
        }
    }
}
