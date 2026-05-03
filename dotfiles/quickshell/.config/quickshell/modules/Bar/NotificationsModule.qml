import QtQuick

BaseModule {
    id: root

    required property var notificationsManager

    property int count: notificationsManager ? notificationsManager.notificationCount : 0

    text: count > 0 ? "󰂚 " + count : "󰂜"
    textColor: count > 0 ? colors.yellow : colors.fg

    onClicked: {
        if (notificationsManager)
            notificationsManager.toggleCenter();
    }
}
