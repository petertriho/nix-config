import QtQuick
import QtQuick.Layouts
import QtQuick.Controls

Rectangle {
    id: root
    radius: 4
    // Clickable bar modules opt into a hover background that mirrors the
    // tray-icon highlight (`colors.bg_highlight`). `hoverHighlight` is
    // deliberately decoupled from `hoverEnabled`: some modules track hover for
    // other reasons (accent text color, hover-to-open detail popups) without
    // being clickable, and must not light up as if they were.
    color: root.hoverHighlight && hoverArea.containsMouse ? colors.bg_highlight : "transparent"
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

    property bool hoverEnabled: false
    property bool hoverHighlight: false
    readonly property bool hovered: hoverArea.containsMouse

    default property alias children: content.data

    Text {
        id: content
        height: parent.height
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: moduleConfig.contentMargins
        anchors.rightMargin: moduleConfig.contentMargins
        color: colors.fg
        font.family: fontsConfig.defaultFamily
        font.pixelSize: fontsConfig.defaultSize
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
    }

    MouseArea {
        id: hoverArea
        anchors.fill: parent
        hoverEnabled: root.hoverEnabled || root.hoverHighlight
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onClicked: function (mouse) {
            if (mouse.button === Qt.RightButton)
                root.rightClicked();
            else
                root.clicked();
        }
    }

    signal clicked
    signal rightClicked
}
