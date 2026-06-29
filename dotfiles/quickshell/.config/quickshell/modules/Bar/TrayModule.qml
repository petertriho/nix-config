import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell

BaseModule {
    id: root

    hoverHighlight: true
    property bool expanded: false
    property real globalX: 0
    property QtObject barWindow: null

    text: expanded ? "󰅃" : "󰅀"

    function updatePosition() {
        var pos = root.mapToItem(null, 0, 0);
        root.globalX = pos.x;
    }

    onXChanged: updatePosition()
    onWidthChanged: updatePosition()
    onBarWindowChanged: updatePosition()
    Component.onCompleted: updatePosition()

    onClicked: {
        updatePosition();
        expanded = !expanded;
    }
}
