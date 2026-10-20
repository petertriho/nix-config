import QtQuick

// One line of a popup: the label on the left, the value right-aligned. The
// label elides when the value needs the space.
Item {
    id: root

    property string label: ""
    property string value: ""
    property color valueColor: Config.colors.base05
    property bool bold: false

    implicitWidth: labelText.implicitWidth + valueText.implicitWidth + 8
    implicitHeight: Math.max(labelText.implicitHeight, valueText.implicitHeight)

    Text {
        id: labelText
        anchors.left: parent.left
        anchors.right: valueText.left
        anchors.rightMargin: 8
        anchors.verticalCenter: parent.verticalCenter
        text: root.label
        color: Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
        elide: Text.ElideRight
    }

    Text {
        id: valueText
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        width: Math.min(implicitWidth, root.width)
        text: root.value
        color: root.valueColor
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
        font.bold: root.bold
        horizontalAlignment: Text.AlignRight
        elide: Text.ElideRight
    }
}
