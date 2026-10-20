import QtQuick

// The surface of every popup and drawer: background, border, radius, padding
// and the open/close animation. The first content item sets the implicit
// size. Content taller than `maxHeight` scrolls.
Rectangle {
    id: root

    property bool open: false
    // 0 = content implicit width + 2 x padding.
    property real preferredWidth: 0
    property real maxHeight: Number.MAX_VALUE
    default property alias content: body.data

    readonly property int padding: Config.style.padding
    readonly property Item contentRoot: body.children.length > 0 ? body.children[0] : null
    // The loader creates the card when `open` is already true. `shown` turns
    // true one event loop pass later, so that the open animation plays.
    property bool created: false
    readonly property bool shown: root.open && root.created

    implicitWidth: root.preferredWidth > 0 ? root.preferredWidth : (root.contentRoot ? root.contentRoot.implicitWidth : 0) + root.padding * 2
    implicitHeight: (root.contentRoot ? root.contentRoot.implicitHeight : 0) + root.padding * 2
    width: root.implicitWidth
    height: Math.min(root.implicitHeight, root.maxHeight)

    color: Config.style.surfaceColor
    border.width: 1
    border.color: Config.style.borderColor
    radius: Config.style.radius

    opacity: root.shown ? 1 : 0
    scale: root.shown ? 1 : 0.98
    transformOrigin: Item.Top

    Behavior on opacity {
        NumberAnimation {
            duration: Config.overlay.animationDurationMs
            easing.type: root.shown ? Easing.OutCubic : Easing.InCubic
        }
    }
    Behavior on scale {
        NumberAnimation {
            duration: Config.overlay.animationDurationMs
            easing.type: root.shown ? Easing.OutCubic : Easing.InCubic
        }
    }

    Component.onCompleted: Qt.callLater(() => root.created = true)

    // Takes the presses that no content item handles. Without it they reach
    // the overlay backdrop, which closes the popup.
    MouseArea {
        anchors.fill: parent
        acceptedButtons: Qt.AllButtons
    }

    Flickable {
        id: flick
        anchors.fill: parent
        anchors.margins: root.padding
        clip: true
        contentWidth: width
        contentHeight: body.height
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        Item {
            id: body
            width: flick.width
            height: root.contentRoot ? root.contentRoot.implicitHeight : 0
        }
    }
}
