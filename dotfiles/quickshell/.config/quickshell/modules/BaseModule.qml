import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import ".."

Rectangle {
    id: root
    color: "transparent"
    height: parent ? parent.height : 30
    implicitWidth: content.implicitWidth + 8

    property alias text: content.text
    property alias textColor: content.color
    property alias font: content.font
    property alias horizontalAlignment: content.horizontalAlignment
    property alias verticalAlignment: content.verticalAlignment

    default property alias children: content.data

    Text {
        id: content
        anchors.centerIn: parent
        anchors.margins: 4
        color: Colors.colors.fg
        font.family: "JetBrainsMono Nerd Font Propo"
        font.pixelSize: 13
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
    }

    MouseArea {
        anchors.fill: parent
        onClicked: root.clicked()
    }

    signal clicked
}
