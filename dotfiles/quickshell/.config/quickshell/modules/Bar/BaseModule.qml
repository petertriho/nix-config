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

    // Click rule of the status modules: a left click opens the popup, a middle
    // click does the quick toggle (`middleClicked`), a right click opens the
    // settings app (`settingsCommand`), and the wheel changes the value
    // (`wheelStepped`). A module without one of these does nothing for it.
    // Objects such as the window title keep left = activate, right = menu.

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

    // The settings app of the module. A right click runs it, and so does the
    // `SettingsFooter` row of the popup, which shows `settingsLabel`.
    property var settingsCommand: []
    property string settingsLabel: ""

    // True makes the wheel emit `wheelStepped`.
    property bool wheelEnabled: false
    // One step per wheel notch (120 units). Touchpad deltas accumulate until
    // they reach a notch.
    property real wheelRemainder: 0

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
        acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
        onClicked: function (mouse) {
            root.handleClick(mouse.button);
        }
    }

    // Up is +1.
    WheelHandler {
        enabled: root.wheelEnabled
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
        onEnabledChanged: root.wheelRemainder = 0
        onWheel: function (event) {
            root.wheelRemainder += event.angleDelta.y;
            while (Math.abs(root.wheelRemainder) >= 120) {
                const direction = root.wheelRemainder > 0 ? 1 : -1;
                root.wheelStepped(direction);
                root.wheelRemainder -= direction * 120;
            }
        }
    }

    signal clicked
    signal middleClicked
    signal rightClicked
    signal wheelStepped(int direction)

    function openSettings(): void {
        if (root.settingsCommand.length === 0)
            return;
        Popups.close();
        Quickshell.execDetached({
            command: root.settingsCommand
        });
    }

    // The tray overflow row also calls this for a hidden module.
    function handleClick(button: int): void {
        if (button === Qt.LeftButton && root.popupOnClick) {
            Popups.toggle(root.popupKey);
            return;
        }
        // A quick toggle starts no app, so an open popup can stay open and
        // show the new state.
        if (button === Qt.MiddleButton) {
            root.middleClicked();
            return;
        }
        if (button === Qt.RightButton && root.settingsCommand.length > 0) {
            root.openSettings();
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
