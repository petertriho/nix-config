pragma ComponentBehavior: Bound

import QtQuick
import ".."
import "../../Common"
import "." as Local

// Network state. A left click opens the network popup, a middle click turns
// Wi-Fi on or off, and a right click opens nm-connection-editor.
BaseModule {
    id: root

    hoverHighlight: true
    popupId: "network"
    settingsCommand: ["nm-connection-editor"]
    settingsLabel: "Open Network Connections"
    text: NetworkService.icon
    // Grey while the state is unknown (no network backend).
    textColor: NetworkService.backendAvailable ? Config.colors.base05 : Config.colors.base03

    BarPopup {
        module: root
        preferredWidth: 340

        Local.Popup {
            module: root
        }
    }

    onMiddleClicked: NetworkService.toggleWifi()
}
