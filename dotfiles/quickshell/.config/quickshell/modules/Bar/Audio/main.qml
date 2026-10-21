pragma ComponentBehavior: Bound

import QtQuick
import ".."
import "../../Common"
import "../../ControlOSD"
import "." as Local

// Output volume. A left click opens the volume popup, a middle click mutes, a
// right click opens pwvucontrol, and the wheel changes the volume.
BaseModule {
    id: root

    hoverHighlight: true
    popupId: "audio"
    settingsCommand: ["pwvucontrol"]
    settingsLabel: "Open Volume Control"
    wheelEnabled: true

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

    BarPopup {
        module: root
        preferredWidth: 360

        Local.Popup {
            module: root
        }
    }

    onMiddleClicked: OsdService.volumeMute()

    onWheelStepped: function (direction) {
        if (direction > 0)
            OsdService.volumeUp();
        else
            OsdService.volumeDown();
    }
}
