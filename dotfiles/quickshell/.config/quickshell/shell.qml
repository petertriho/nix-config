import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import "modules/Bar"
import "modules/Bar/workspaces" as WorkspaceFeature
import "modules/CodexBar" as CodexFeature
import "modules/ControlOSD" as OsdFeature
import "modules/Notifications" as NotifyFeature

ShellRoot {
    id: root

    // Configuration component with colors
    Loader {
        id: configLoader
        source: "config.qml"
    }

    // Expose config colors for easier access
    property QtObject config: configLoader.item

    // Notification manager must be declared before Bar since Bar requires it.
    NotifyFeature.Manager {
        id: notifications
        colors: config.colors
        fontsConfig: config.fonts
        notificationsConfig: config.notifications
        overlayConfig: config.overlay
    }

    // CodexBar usage service (one instance; owns the polling process + panel).
    // NOTE: id is `codexBarSvc`, not `codexBarService` — the Bar exposes a
    // property of that name, and `codexBarService: codexBarService` in the
    // delegate would resolve to the Bar's own (null) property instead of this
    // id. Distinct names avoid the QML shadowing footgun.
    CodexFeature.Service {
        id: codexBarSvc
        colors: config.colors
        fontsConfig: config.fonts
        codexbarConfig: config.codexbar
        overlayConfig: config.overlay
    }

    WorkspaceFeature.WorkspaceService {
        id: workspaceSvc
        ignoreClasses: config && config.workspaces ? config.workspaces.ignoreClasses : []
        windowIcons: config ? config.windowIcons : ({})
        updateInterval: config && config.workspaces ? config.workspaces.updateInterval : 200
        activeUpdateInterval: config && config.workspaces ? config.workspaces.activeUpdateInterval : 100
    }

    // Bar components, one per connected screen.
    Variants {
        model: Quickshell.screens

        delegate: Component {
            Bar {
                required property var modelData

                screen: modelData
                colors: config.colors
                barConfig: config.bar
                moduleConfig: config.module
                workspacesConfig: config.workspaces
                intervalsConfig: config.intervals
                thresholdsConfig: config.thresholds
                stepsConfig: config.steps
                popupsConfig: config.popups
                overlayConfig: config.overlay
                fontsConfig: config.fonts
                notificationsManager: notifications
                codexBarService: codexBarSvc
                workspaceService: workspaceSvc
            }
        }
    }

    // Control components
    OsdFeature.Brightness {
        id: brightnessControl
        colors: config.colors
    }

    OsdFeature.Volume {
        id: volumeControl
        colors: config.colors
    }

    // OSD components
    OsdFeature.ControlOSD {
        id: brightnessOsd
        title: "Brightness"
        value: brightnessControl.brightness
        progressColor: config.colors.base0A
        colors: config.colors
        osdConfig: config.osd
    }

    OsdFeature.ControlOSD {
        id: volumeOsd
        title: "Volume"
        value: volumeControl.volume
        progressColor: config.colors.base0B
        showMute: true
        isMuted: volumeControl.muted
        colors: config.colors
        osdConfig: config.osd
    }

    Component.onCompleted: {
        // Set up periodic updates to sync with actual system state
        updateTimer.start();
    }

    Timer {
        id: updateTimer
        interval: config.intervals.global
        repeat: true
        onTriggered: {
            brightnessControl.getBrightness();
            volumeControl.getVolume();
            volumeControl.isMuted();
        }
    }

    function brightnessUp() {
        brightnessControl.increase(config.steps.brightness);
        brightnessOsd.show();
    }

    function brightnessDown() {
        brightnessControl.decrease(config.steps.brightness);
        brightnessOsd.show();
    }

    function brightnessShow() {
        brightnessControl.getBrightness();
        brightnessOsd.show();
    }

    function volumeUp() {
        volumeControl.increase(config.steps.volume);
        volumeOsd.show();
    }

    function volumeDown() {
        volumeControl.decrease(config.steps.volume);
        volumeOsd.show();
    }

    function volumeMute() {
        volumeControl.toggleMute();
        volumeOsd.show();
    }

    IpcHandler {
        target: "quickshell-osd"

        function brightnessUp(): void {
            root.brightnessUp();
        }
        function brightnessDown(): void {
            root.brightnessDown();
        }
        function brightnessShow(): void {
            root.brightnessShow();
        }
        function volumeUp(): void {
            root.volumeUp();
        }
        function volumeDown(): void {
            root.volumeDown();
        }
        function volumeMute(): void {
            root.volumeMute();
        }
    }

    IpcHandler {
        target: "quickshell-notifications"

        function toggle(): void {
            notifications.toggleCenter();
        }
        function show(): void {
            notifications.showCenter();
        }
        function hide(): void {
            notifications.hideCenter();
        }
        function clear(): void {
            notifications.clearAll();
        }
    }

    // Hyprland global shortcuts use the compositor protocol; Niri calls the IPC handler above.
    Loader {
        active: workspaceSvc.compositorName === "hyprland"
        sourceComponent: hyprlandGlobalShortcuts
    }

    Component {
        id: hyprlandGlobalShortcuts

        Item {
            GlobalShortcut {
                name: "brightness-up"
                description: "Increase brightness"
                appid: "quickshell-osd"

                onPressed: {
                    root.brightnessUp();
                }
            }

            GlobalShortcut {
                name: "brightness-down"
                description: "Decrease brightness"
                appid: "quickshell-osd"

                onPressed: {
                    root.brightnessDown();
                }
            }

            GlobalShortcut {
                name: "volume-up"
                description: "Increase volume"
                appid: "quickshell-osd"

                onPressed: {
                    root.volumeUp();
                }
            }

            GlobalShortcut {
                name: "volume-down"
                description: "Decrease volume"
                appid: "quickshell-osd"

                onPressed: {
                    root.volumeDown();
                }
            }

            GlobalShortcut {
                name: "volume-mute"
                description: "Toggle mute"
                appid: "quickshell-osd"

                onPressed: {
                    root.volumeMute();
                }
            }
        }
    }
}
