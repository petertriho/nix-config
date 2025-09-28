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
    property QtObject config: configLoader.item ? configLoader.item : null

    // Bar component
    Bar {
        id: bar
        colors: config ? config.colors : null
        config: config
        windowIcons: config ? config.windowIcons : null
    }

    // Control components
    BrightnessControl {
        id: brightnessControl
        colors: config ? config.colors : null
    }

    VolumeControl {
        id: volumeControl
        colors: config ? config.colors : null
    }

    // OSD components
    ControlOSD {
        id: brightnessOsd
        title: "Brightness"
        value: brightnessControl.brightness
        progressColor: config ? config.colors.yellow : "#e0af68"
        colors: config ? config.colors : null
        config: config
    }

    ControlOSD {
        id: volumeOsd
        title: "Volume"
        value: volumeControl.volume
        progressColor: config ? config.colors.green : "#9ece6a"
        showMute: true
        isMuted: volumeControl.muted
        colors: config ? config.colors : null
        config: config
    }

    Component.onCompleted: {
        // Set up periodic updates to sync with actual system state
        updateTimer.start();
    }

    Timer {
        id: updateTimer
        interval: config ? config.intervals.global : 5000
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
            brightnessControl.increase(config ? config.steps.brightness : 5);
            brightnessOsd.show();
        }
    }

    GlobalShortcut {
        name: "brightness-down"
        description: "Decrease brightness"
        appid: "quickshell-osd"

        onPressed: {
            brightnessControl.decrease(config ? config.steps.brightness : 5);
            brightnessOsd.show();
        }
    }

    GlobalShortcut {
        name: "volume-up"
        description: "Increase volume"
        appid: "quickshell-osd"

        onPressed: {
            volumeControl.increase(config ? config.steps.volume : 5);
            volumeOsd.show();
        }
    }

    GlobalShortcut {
        name: "volume-down"
        description: "Decrease volume"
        appid: "quickshell-osd"

        onPressed: {
            volumeControl.decrease(config ? config.steps.volume : 5);
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
