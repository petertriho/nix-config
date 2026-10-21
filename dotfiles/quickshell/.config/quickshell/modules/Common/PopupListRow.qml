import QtQuick

// A row of a popup list: an icon, a label that elides, and a status text on
// the right. A click emits `clicked`. A disabled row is dim and takes no
// clicks. The parent sets the width.
Rectangle {
    id: root

    property string icon: ""
    property string label: ""
    property string status: ""
    // The current item of the list (the default device, the connected
    // network). Its label is bright, the others are dim.
    property bool current: false
    property color iconColor: root.current ? Config.style.accentColor : Config.colors.base04
    property color statusColor: Config.colors.base03

    signal clicked

    implicitHeight: labelText.implicitHeight + 8
    radius: Config.style.radiusSmall
    color: rowMouse.containsMouse ? Config.style.hoverColor : "transparent"

    Text {
        id: iconText
        x: 4
        width: Config.fonts.defaultSize + 8
        anchors.verticalCenter: parent.verticalCenter
        text: root.icon
        color: root.enabled ? root.iconColor : Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
    }

    Text {
        id: statusText
        anchors.right: parent.right
        anchors.rightMargin: 4
        anchors.verticalCenter: parent.verticalCenter
        text: root.status
        color: root.statusColor
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
    }

    Text {
        id: labelText
        anchors.left: iconText.right
        anchors.right: statusText.left
        anchors.rightMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        text: root.label
        color: root.current && root.enabled ? Config.colors.base05 : Config.colors.base04
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        elide: Text.ElideRight
    }

    MouseArea {
        id: rowMouse
        anchors.fill: parent
        hoverEnabled: true
        onClicked: root.clicked()
    }
}
