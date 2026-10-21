import QtQuick
import "../Common"
import "../Notifications"

BaseModule {
    id: root

    hoverHighlight: true

    property int count: NotificationService.notificationCount

    text: count > 0 ? "󰂚 " + count : "󰂜"
    textColor: count > 0 ? Config.colors.base0A : Config.colors.base05

    // Room for a two-digit count, so that the clock does not move when the
    // count changes.
    minContentWidth: widestText.advanceWidth

    TextMetrics {
        id: widestText
        font: root.font
        text: "󰂚 99"
    }

    managesPopups: true

    onClicked: NotificationService.toggleCenter()
}
