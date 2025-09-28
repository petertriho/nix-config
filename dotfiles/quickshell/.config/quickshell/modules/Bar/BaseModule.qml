import QtQuick
import QtQuick.Layouts
import QtQuick.Controls

Rectangle {
    id: root
    color: "transparent"
    height: parent.height
    implicitWidth: content.implicitWidth + moduleConfig.widthPadding

    // Accept colors from parent
    property QtObject colors: parent.colors
    property QtObject moduleConfig: parent.moduleConfig
    property QtObject fontsConfig: parent.fontsConfig

    property alias text: content.text
    property alias textColor: content.color
    property alias font: content.font
    property alias horizontalAlignment: content.horizontalAlignment
    property alias verticalAlignment: content.verticalAlignment

    default property alias children: content.data

    Text {
        id: content
        anchors.centerIn: parent
        anchors.margins: moduleConfig.contentMargins
        color: colors.fg
        font.family: fontsConfig.defaultFamily
        font.pixelSize: fontsConfig.defaultSize
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
    }

    MouseArea {
        anchors.fill: parent
        onClicked: root.clicked()
    }

    signal clicked
}
