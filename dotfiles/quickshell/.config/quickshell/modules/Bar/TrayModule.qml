import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell

Rectangle {
    id: root
    color: "transparent"
    height: parent.height
    implicitWidth: chevronRow.implicitWidth + moduleConfig.widthPadding

    property QtObject colors: parent.colors
    property QtObject moduleConfig: parent.moduleConfig
    property QtObject fontsConfig: parent.fontsConfig

    property bool expanded: false
    property real globalX: 0
    property QtObject barWindow: null

    signal clicked
    signal rightClicked

    function updatePosition() {
        var pos = root.mapToItem(null, 0, 0)
        root.globalX = pos.x
    }

    onXChanged: updatePosition()
    onWidthChanged: updatePosition()
    onBarWindowChanged: updatePosition()
    Component.onCompleted: updatePosition()

    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onClicked: function(mouse) {
            if (mouse.button === Qt.RightButton) root.rightClicked()
            else {
                expanded = !expanded
                root.clicked()
            }
        }
    }

    Row {
        id: chevronRow
        anchors.centerIn: parent
        Text {
            text: expanded ? "󰅃" : "󰅀"
            color: root.colors.fg
            font.family: root.fontsConfig.defaultFamily
            font.pixelSize: root.fontsConfig.defaultSize
            anchors.verticalCenter: parent.verticalCenter
        }
    }
}
