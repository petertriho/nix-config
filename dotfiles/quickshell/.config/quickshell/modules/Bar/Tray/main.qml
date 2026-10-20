pragma ComponentBehavior: Bound

import QtQuick
import Quickshell.Services.SystemTray
import ".."
import "../../Common"
import "." as Local

BaseModule {
    id: root

    hoverHighlight: true
    popupId: "tray"
    property var hiddenIds: []
    property var idMap: ({})
    property var overflowNames: ({})

    // Shown while it has tray items or hosts hidden bar modules. The bar fit
    // always reserves its width, so this cannot make a binding loop.
    available: SystemTray.items.values.length > 0 || root.hiddenIds.length > 0

    text: root.popupOpen ? "󰅃" : "󰅀"

    BarPopup {
        module: root

        Local.Popup {
            module: root
        }
    }
}
