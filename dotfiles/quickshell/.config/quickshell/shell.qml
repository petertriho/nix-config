import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import QtQuick.Dialogs
import "."

ShellRoot {
    id: root

    // Bar component
    Bar {
        id: bar
    }

    // Control components
    BrightnessControl {
        id: brightnessControl
    }

    VolumeControl {
        id: volumeControl
    }

    // OSD components
    ControlOsd {
        id: brightnessOsd
        title: "Brightness"
        value: brightnessControl.brightness
        progressColor: Colors.colors.yellow
    }

    ControlOsd {
        id: volumeOsd
        title: "Volume"
        value: volumeControl.volume
        progressColor: Colors.colors.green
        showMute: true
        isMuted: volumeControl.muted
    }

    Component.onCompleted: {
        // Set up periodic updates to sync with actual system state
        updateTimer.start();
    }

    Timer {
        id: updateTimer
        interval: 5000 // Update every 5 seconds
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
            brightnessControl.increase();
            brightnessOsd.show();
        }
    }

    GlobalShortcut {
        name: "brightness-down"
        description: "Decrease brightness"
        appid: "quickshell-osd"

        onPressed: {
            brightnessControl.decrease();
            brightnessOsd.show();
        }
    }

    GlobalShortcut {
        name: "volume-up"
        description: "Increase volume"
        appid: "quickshell-osd"

        onPressed: {
            volumeControl.increase();
            volumeOsd.show();
        }
    }

    GlobalShortcut {
        name: "volume-down"
        description: "Decrease volume"
        appid: "quickshell-osd"

        onPressed: {
            volumeControl.decrease();
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
