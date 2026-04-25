import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Services.Pipewire

BaseModule {
    id: root

    property var sink: Pipewire.defaultAudioSink
    property real volume: sink && sink.audio ? Math.round(sink.audio.volume * 100) : 0
    property bool isMuted: sink && sink.audio ? sink.audio.muted : false
    property bool isBluetooth: false
    property string deviceType: "default"
    property string icon: isMuted ? "󰖁" : isBluetooth ? "󰂯 " + getVolumeIcon() : getVolumeIcon()
    property QtObject intervalsConfig: parent.intervalsConfig
    property QtObject thresholdsConfig: parent.thresholdsConfig
    property QtObject stepsConfig: parent.stepsConfig

    PwObjectTracker {
        objects: [Pipewire.defaultAudioSink]
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

        var lowThreshold = thresholdsConfig.volume.low;
        var mediumThreshold = thresholdsConfig.volume.medium;

        if (volume < lowThreshold)
            return "󰕿";
        if (volume < mediumThreshold)
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
