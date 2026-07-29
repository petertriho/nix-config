import QtQuick

BaseModule {
    id: root

    hoverHighlight: true
    required property var notificationsManager

    property int count: notificationsManager ? notificationsManager.notificationCount : 0

    text: count > 0 ? "󰂚 " + count : "󰂜"
    textColor: count > 0 ? colors.base0A : colors.base05

    onClicked: {
        if (notificationsManager)
            notificationsManager.toggleCenter();
    }
}
