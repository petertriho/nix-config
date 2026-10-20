import QtQuick
import QtQuick.Layouts
import "../Common"

// Icon, bar, and percent for the control that the service shows. The bar clock
// hosts this item in its own footprint, so it must not set the clock's width.
Item {
    id: root

    readonly property real value: OsdService.value
    readonly property bool muted: OsdService.muted
    readonly property color textColor: muted ? Config.colors.base08 : Config.colors.base05

    RowLayout {
        anchors.fill: parent
        spacing: Config.osd.spacing

        Text {
            text: OsdService.icon
            color: root.textColor
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize
            Layout.alignment: Qt.AlignVCenter
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignVCenter
            Layout.preferredHeight: Config.osd.progressBarHeight
            radius: Config.osd.progressBarCornerRadius
            color: Config.colors.base02

            Rectangle {
                height: parent.height
                // Another tool can set volume above 100%; the fill stops at full.
                width: parent.width * Math.max(0, Math.min(1, root.value / 100))
                radius: parent.radius
                color: OsdService.fillColor
            }
        }

        Text {
            id: percentText
            text: Math.round(root.value) + "%"
            color: root.textColor
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize
            horizontalAlignment: Text.AlignRight
            // Fixed width so the bar does not move when the digit count changes.
            Layout.preferredWidth: percentMetrics.advanceWidth
            Layout.alignment: Qt.AlignVCenter
        }
    }

    TextMetrics {
        id: percentMetrics
        font: percentText.font
        text: "100%"
    }
}
