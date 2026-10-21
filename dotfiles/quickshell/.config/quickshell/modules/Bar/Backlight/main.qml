pragma ComponentBehavior: Bound

import QtQuick
import ".."
import "../../Common"
import "../../ControlOSD"
import "." as Local

// Screen brightness. A left click opens the brightness popup, and the wheel
// changes the brightness. Brightness has no quick toggle and no settings app.
BaseModule {
    id: root

    hoverHighlight: true
    popupId: "backlight"
    wheelEnabled: true
    // Hidden on a host without a backlight device.
    available: OsdService.brightnessControl.available
    text: OsdService.brightnessControl.icon

    BarPopup {
        module: root
        preferredWidth: 280

        Local.Popup {}
    }

    onWheelStepped: function (direction) {
        if (direction > 0)
            OsdService.brightnessUp();
        else
            OsdService.brightnessDown();
    }
}
