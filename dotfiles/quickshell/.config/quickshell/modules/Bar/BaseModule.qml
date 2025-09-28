import QtQuick
import QtQuick.Layouts
import QtQuick.Controls

Rectangle {
    id: root
    color: "transparent"
    height: parent ? parent.height : (config ? config.module.defaultHeight : 24)
    implicitWidth: content.implicitWidth + (config ? config.module.widthPadding : 8)

    // Accept colors from parent
    property QtObject colors: parent.colors
    property QtObject config: parent.config

    property alias text: content.text
    property alias textColor: content.color
    property alias font: content.font
    property alias horizontalAlignment: content.horizontalAlignment
    property alias verticalAlignment: content.verticalAlignment

    default property alias children: content.data

    Text {
        id: content
        anchors.centerIn: parent
        anchors.margins: config ? config.module.contentMargins : 4
        color: colors ? colors.fg : "#a9b1d6"
        font.family: config ? config.fonts.defaultFamily : "JetBrainsMono Nerd Font Propo"
        font.pixelSize: config ? config.fonts.defaultSize : 13
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
    }

    MouseArea {
        anchors.fill: parent
        onClicked: root.clicked()
    }

    signal clicked
}
