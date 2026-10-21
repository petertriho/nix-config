import QtQuick
import Quickshell
import "../Common"

Rectangle {
    id: root
    radius: Config.style.radiusSmall
    // Clickable bar modules opt into a hover background that mirrors the
    // tray-icon highlight (`style.hoverColor`). `hoverHighlight` is
    // deliberately decoupled from `hoverEnabled`: some modules track hover for
    // other reasons (accent text color, hover-to-open detail popups) without
    // being clickable, and must not light up as if they were.
    color: root.hoverHighlight && hoverArea.containsMouse ? Config.style.hoverColor : "transparent"
    height: parent.height
    implicitWidth: Math.max(label.implicitWidth, root.minContentWidth) + Config.module.widthPadding + root.extraPadding * 2

    // False hides the module and drops it from the bar fit calculation.
    property bool available: true

    // A module whose text changes width sets this, so that the modules to its
    // left in the right-anchored Row do not move.
    property real minContentWidth: 0
    // Space on both sides of the text. A module at an end of the bar uses it
    // to fill the bar margin, so that its hover highlight and click area reach
    // the screen edge and its text stays centered.
    property real extraPadding: 0

    // A popup module sets `popupId` (clock, battery, bluetooth, caffeine, stats,
    // tray). A left click toggles the popup unless `popupOnClick` is false.
    property string popupId: ""
    property bool popupOnClick: root.popupId !== ""
    readonly property var barWindow: QsWindow.window
    readonly property string popupKey: root.popupId !== "" && root.barWindow && root.barWindow.screen ? root.barWindow.screen.name + ":" + root.popupId : ""
    readonly property bool popupOpen: root.popupKey !== "" && Popups.active === root.popupKey
    // An open popup keeps the keyboard focus, so a click that starts an app
    // closes it first. A module that opens or closes popups in its own click
    // handlers sets this to true.
    property bool managesPopups: false

    property alias text: label.text
    property alias textColor: label.color
    property alias textFormat: label.textFormat
    property alias font: label.font
    property alias horizontalAlignment: label.horizontalAlignment
    property alias verticalAlignment: label.verticalAlignment
    property alias elide: label.elide

    property bool hoverEnabled: false
    property bool hoverHighlight: false
    readonly property bool hovered: hoverArea.containsMouse

    default property alias content: label.data

    Text {
        id: label
        height: parent.height
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        anchors.leftMargin: Config.module.contentMargins + root.extraPadding
        anchors.rightMargin: Config.module.contentMargins + root.extraPadding
        color: Config.colors.base05
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
    }

    MouseArea {
        id: hoverArea
        anchors.fill: parent
        hoverEnabled: root.hoverEnabled || root.hoverHighlight
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        onClicked: function (mouse) {
            root.handleClick(mouse.button);
        }
    }

    signal clicked
    signal rightClicked

    // The tray overflow row also calls this for a hidden module.
    function handleClick(button: int): void {
        if (button === Qt.LeftButton && root.popupOnClick) {
            Popups.toggle(root.popupKey);
            return;
        }
        if (!root.managesPopups)
            Popups.close();
        if (button === Qt.RightButton)
            root.rightClicked();
        else
            root.clicked();
    }
}
