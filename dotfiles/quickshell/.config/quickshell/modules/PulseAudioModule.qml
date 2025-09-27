import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

BaseModule {
    id: root

    property real volume: 0
    property bool isMuted: false
    property bool isBluetooth: false
    property string deviceType: "default"
    property string icon: "󰕿"

    Timer {
        interval: 2000
        repeat: true
        running: true
        onTriggered: updateVolume()
    }

    Component.onCompleted: updateVolume()

    Process {
        id: volumeProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    parseVolumeInfo(output);
                }
            }
        }
    }

    function updateVolume() {
        volumeProcess.exec({
            command: ["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"]
        });
    }

    function parseVolumeInfo(output) {
        var volumeMatch = output.match(/Volume: ([\d.]+)/);
        if (volumeMatch) {
            volume = Math.round(parseFloat(volumeMatch[1]) * 100);
            updateIcon();
        }
    }

    function updateIcon() {
        if (isMuted) {
            icon = "󰝟";
        } else if (isBluetooth) {
            icon = "󰂯 " + getVolumeIcon();
        } else {
            icon = getVolumeIcon();
        }
    }

    function getVolumeIcon() {
        if (deviceType === "headphone")
            return "󰋋";
        if (deviceType === "hands-free")
            return "󱡏";
        if (deviceType === "headset")
            return "󰋎";
        if (deviceType === "phone")
            return "󰏲";
        if (deviceType === "portable")
            return "󰦢";
        if (deviceType === "car")
            return "󰄋";

        if (volume < 33)
            return "󰕿";
        if (volume < 66)
            return "󰖀";
        return "󰕾";
    }

    text: icon

    onClicked: {
        Quickshell.execDetached({
            command: ["pwvucontrol"]
        });
    }
}
