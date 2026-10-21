pragma ComponentBehavior: Bound

import QtQuick
import ".."
import "../../Common"
import "." as Local

BaseModule {
    id: root

    hoverHighlight: true
    // A left click opens the popup (on/off and durations), and a middle click
    // turns caffeine on or off. Caffeine has no settings app.
    popupId: "caffeine"

    text: {
        if (!CaffeineService.active)
            return "󰾪";
        if (CaffeineService.remainingSeconds > 0) {
            // Rounded up, so the last minute shows "1m", not "0m".
            const m = Math.ceil(CaffeineService.remainingSeconds / 60);
            const h = Math.floor(m / 60);
            if (h > 0)
                return "󰅶 " + h + "h" + (m % 60 > 0 ? (m % 60) + "m" : "");
            return "󰅶 " + m + "m";
        }
        return "󰅶";
    }

    function activateWithDuration(minutes) {
        CaffeineService.activateWithDuration(minutes);
        if (root.popupOpen)
            Popups.close();
    }

    function toggleIndefinite() {
        CaffeineService.toggleIndefinite();
        if (root.popupOpen)
            Popups.close();
    }

    BarPopup {
        module: root
        preferredWidth: 180

        Local.Popup {
            module: root
        }
    }

    onMiddleClicked: CaffeineService.toggleIndefinite()
}
