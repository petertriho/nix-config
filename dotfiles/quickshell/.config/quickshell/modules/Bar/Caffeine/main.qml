pragma ComponentBehavior: Bound

import QtQuick
import ".."
import "../../Common"
import "." as Local

BaseModule {
    id: root

    hoverHighlight: true
    // Left click toggles caffeine; right click opens the duration picker.
    popupId: "caffeine"
    popupOnClick: false
    managesPopups: true

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

    BarPopup {
        module: root

        Local.Popup {
            module: root
        }
    }

    onClicked: {
        if (root.popupOpen) {
            Popups.close();
            return;
        }
        CaffeineService.toggleIndefinite();
    }

    onRightClicked: Popups.toggle(root.popupKey)
}
