import QtQuick
import Quickshell
import "../Common"

BaseModule {
    id: root

    hoverHighlight: true
    text: NetworkService.icon
    // Grey while the state is unknown (no network backend).
    textColor: NetworkService.backendAvailable ? Config.colors.base05 : Config.colors.base03

    onClicked: {
        Quickshell.execDetached({
            command: ["nm-connection-editor"]
        });
    }
}
