import QtQuick
import Quickshell
import "../ControlOSD"

BaseModule {
    id: root

    hoverHighlight: true
    readonly property Volume volumeControl: OsdService.volumeControl
    readonly property var sinkProperties: root.volumeControl.sink ? root.volumeControl.sink.properties : ({})
    readonly property bool isBluetooth: root.sinkProperties["device.api"] === "bluez5"
    // WirePlumber copies the form factor of an ALSA device (for example a USB
    // headset) to its nodes. Bluetooth nodes do not carry it.
    readonly property string formFactor: root.sinkProperties["device.form-factor"] || ""
    readonly property var formFactorIcons: ({
            "headphone": "󰋋",
            "hands-free": "󱡏",
            "headset": "󰋎",
            "handset": "󰏲",
            "portable": "󰦢",
            "car": "󰄋"
        })
    readonly property string deviceIcon: root.formFactorIcons[root.formFactor] || root.volumeControl.icon
    readonly property string icon: root.volumeControl.muted ? "󰖁" : root.isBluetooth ? "󰂯 " + root.deviceIcon : root.deviceIcon

    text: root.icon

    onClicked: {
        Quickshell.execDetached({
            command: ["pwvucontrol"]
        });
    }
}
