import QtQuick
import Quickshell

BaseModule {
    id: root

    property string icon: ""
    property string url: ""
    property string accentColor: ""

    hoverEnabled: true
    text: icon
    textColor: hovered && accentColor.length > 0 ? accentColor : colors.fg

    onClicked: {
        if (url.length === 0)
            return;
        Quickshell.execDetached({
            command: ["vicinae", url]
        });
    }
}
