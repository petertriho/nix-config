import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import QtQuick.Dialogs
import "modules/Bar/workspaces/workspaceHelpers.js" as WorkspaceHelpers
import "modules/Bar"
import "modules/ControlOSD"

ShellRoot {
    id: root

    property string compositorName: ""

    // Configuration component with colors
    Loader {
        id: configLoader
        source: "config.qml"
    }

    // Expose config colors for easier access
    property QtObject config: configLoader.item

    // Bar component
    Bar {
        id: bar
        colors: config.colors
        barConfig: config.bar
        moduleConfig: config.module
        workspacesConfig: config.workspaces
        intervalsConfig: config.intervals
        thresholdsConfig: config.thresholds
        stepsConfig: config.steps
        fontsConfig: config.fonts
        windowIcons: config.windowIcons
    }

    // Control components
    BrightnessControl {
        id: brightnessControl
        colors: config.colors
    }

    VolumeControl {
        id: volumeControl
        colors: config.colors
    }

    // OSD components
    ControlOSD {
        id: brightnessOsd
        title: "Brightness"
        value: brightnessControl.brightness
        progressColor: config.colors.yellow
        colors: config.colors
        osdConfig: config.osd
    }

    ControlOSD {
        id: volumeOsd
        title: "Volume"
        value: volumeControl.volume
        progressColor: config.colors.green
        showMute: true
        isMuted: volumeControl.muted
        colors: config.colors
        osdConfig: config.osd
    }

    Component.onCompleted: {
        detectCompositorProcess.exec({
            command: ["sh", "-lc", "env"]
        });

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

    Process {
        id: detectCompositorProcess
        stdout: StdioCollector {
            onStreamFinished: {
                const env = WorkspaceHelpers.parseEnvironmentSnapshot(this.text.trim());
                root.compositorName = WorkspaceHelpers.detectCompositor(env);
            }
        }
    }

    IpcHandler {
        target: "quickshell-osd"

        function brightnessUp(): void { root.brightnessUp(); }
        function brightnessDown(): void { root.brightnessDown(); }
        function volumeUp(): void { root.volumeUp(); }
        function volumeDown(): void { root.volumeDown(); }
        function volumeMute(): void { root.volumeMute(); }
    }

    // Hyprland global shortcuts use the compositor protocol; Niri calls the IPC handler above.
    Loader {
        active: WorkspaceHelpers.shouldEnableHyprlandGlobalShortcuts(root.compositorName)
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
