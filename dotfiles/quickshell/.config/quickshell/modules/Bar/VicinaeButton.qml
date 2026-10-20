import QtQuick
import Quickshell
import "../Common"

BaseModule {
    id: root

    property string icon: ""
    property string url: ""
    property string accentColor: ""

    hoverEnabled: true
    hoverHighlight: true
    text: icon
    textColor: hovered && accentColor.length > 0 ? accentColor : Config.colors.base05

    onClicked: {
        if (url.length === 0)
            return;
        Quickshell.execDetached({
            command: ["vicinae", url]
        });
    }
}
