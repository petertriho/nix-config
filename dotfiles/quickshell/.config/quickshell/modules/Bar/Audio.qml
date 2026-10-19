import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell

BaseModule {
    id: root

    hoverHighlight: true
    property var osdService
    readonly property var volumeControl: osdService ? osdService.volumeControl : null
    property real volume: volumeControl ? volumeControl.volume : 0
    property bool isMuted: volumeControl ? volumeControl.muted : false
    property bool isBluetooth: false
    property string deviceType: "default"
    property string icon: isMuted ? "󰖁" : isBluetooth ? "󰂯 " + getVolumeIcon() : getVolumeIcon()
    property QtObject intervalsConfig: parent.intervalsConfig
    property QtObject stepsConfig: parent.stepsConfig

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

        return volumeControl ? volumeControl.icon : "󰕾";
    }

    text: icon

    onClicked: {
        Quickshell.execDetached({
            command: ["pwvucontrol"]
        });
    }
}
