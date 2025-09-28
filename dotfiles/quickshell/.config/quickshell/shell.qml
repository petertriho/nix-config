import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import QtQuick.Dialogs
import "modules/Bar"
import "modules/ControlOSD"

ShellRoot {
    id: root

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

    // Global key bindings using Quickshell.Hyprland
    GlobalShortcut {
        name: "brightness-up"
        description: "Increase brightness"
        appid: "quickshell-osd"

        onPressed: {
            brightnessControl.increase(config.steps.brightness);
            brightnessOsd.show();
        }
    }

    GlobalShortcut {
        name: "brightness-down"
        description: "Decrease brightness"
        appid: "quickshell-osd"

        onPressed: {
            brightnessControl.decrease(config.steps.brightness);
            brightnessOsd.show();
        }
    }

    GlobalShortcut {
        name: "volume-up"
        description: "Increase volume"
        appid: "quickshell-osd"

        onPressed: {
            volumeControl.increase(config.steps.volume);
            volumeOsd.show();
        }
    }

    GlobalShortcut {
        name: "volume-down"
        description: "Decrease volume"
        appid: "quickshell-osd"

        onPressed: {
            volumeControl.decrease(config.steps.volume);
            volumeOsd.show();
        }
    }

    GlobalShortcut {
        name: "volume-mute"
        description: "Toggle mute"
        appid: "quickshell-osd"

        onPressed: {
            volumeControl.toggleMute();
            volumeOsd.show();
        }
    }
}
