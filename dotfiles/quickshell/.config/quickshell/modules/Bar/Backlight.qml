import QtQuick
import "../ControlOSD"

BaseModule {
    id: root

    hoverHighlight: true
    // Hidden on a host without a backlight device.
    available: OsdService.brightnessControl.available
    text: OsdService.brightnessControl.icon

    onClicked: OsdService.brightnessShow()
}
