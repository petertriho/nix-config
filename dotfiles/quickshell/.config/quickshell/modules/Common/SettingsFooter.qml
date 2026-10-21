import QtQuick

// The last row of a popup whose module has a settings app: a separator and a
// row with `module.settingsLabel`. A click runs the same command as a right
// click on the module. The parent sets the width.
Column {
    id: root

    // A BaseModule.
    property var module

    visible: !!root.module && root.module.settingsCommand.length > 0
    spacing: Config.popups.itemSpacing
    topPadding: 2

    Rectangle {
        width: root.width
        height: 1
        color: Config.style.borderColor
    }

    Rectangle {
        width: root.width
        height: footerText.implicitHeight + 8
        color: footerMouse.containsMouse ? Config.style.hoverColor : "transparent"
        radius: Config.style.radiusSmall

        Text {
            id: footerText
            anchors.centerIn: parent
            text: root.module ? root.module.settingsLabel : ""
            color: Config.colors.base05
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize
        }

        MouseArea {
            id: footerMouse
            anchors.fill: parent
            hoverEnabled: true
            onClicked: root.module.openSettings()
        }
    }
}
