import QtQuick
import "../Common"
import "../Notifications"

BaseModule {
    id: root

    hoverHighlight: true

    property int count: NotificationService.notificationCount

    text: count > 0 ? "󰂚 " + count : "󰂜"
    textColor: count > 0 ? Config.colors.base0A : Config.colors.base05

    managesPopups: true

    onClicked: NotificationService.toggleCenter()
}
