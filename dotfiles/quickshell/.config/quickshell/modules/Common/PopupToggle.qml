import QtQuick

// A bold label with a switch on the right. A click on the row emits `toggled`.
// A disabled toggle is dim and takes no clicks; `note` can say why. The parent
// sets the width.
Rectangle {
    id: root

    property string label: ""
    property bool checked: false
    // A dim text between the label and the switch.
    property string note: ""

    signal toggled

    implicitHeight: Math.max(labelText.implicitHeight, knobTrack.height) + 6
    radius: Config.style.radiusSmall
    color: toggleMouse.containsMouse ? Config.style.hoverColor : "transparent"

    Text {
        id: labelText
        anchors.left: parent.left
        anchors.leftMargin: 4
        anchors.verticalCenter: parent.verticalCenter
        text: root.label
        color: root.enabled ? Config.colors.base05 : Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        font.bold: true
    }

    Text {
        anchors.left: labelText.right
        anchors.leftMargin: 8
        anchors.right: knobTrack.left
        anchors.rightMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        text: root.note
        color: Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
        horizontalAlignment: Text.AlignRight
        elide: Text.ElideRight
    }

    Rectangle {
        id: knobTrack
        anchors.right: parent.right
        anchors.rightMargin: 4
        anchors.verticalCenter: parent.verticalCenter
        width: 30
        height: 16
        radius: height / 2
        // Not base02 when off: that is the hover color of the row.
        color: !root.enabled ? Config.colors.base02 : root.checked ? Config.style.accentColor : Config.colors.base03

        Rectangle {
            x: root.checked ? parent.width - width - 2 : 2
            anchors.verticalCenter: parent.verticalCenter
            width: parent.height - 4
            height: width
            radius: width / 2
            color: root.enabled ? Config.colors.base07 : Config.colors.base03

            Behavior on x {
                NumberAnimation {
                    duration: Config.overlay.animationDurationMs
                    easing.type: Easing.OutCubic
                }
            }
        }
    }

    MouseArea {
        id: toggleMouse
        anchors.fill: parent
        hoverEnabled: true
        onClicked: root.toggled()
    }
}
