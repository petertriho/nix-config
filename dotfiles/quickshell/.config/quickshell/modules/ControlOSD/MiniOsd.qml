import QtQuick
import QtQuick.Layouts

// Icon, bar, and percent for the control that the service shows. The bar clock
// hosts this item in its own footprint, so it must not set the clock's width.
Item {
    id: root

    property var osdService: null
    property QtObject colors: null
    property QtObject fontsConfig: null
    readonly property QtObject osdConfig: osdService ? osdService.osdConfig : null

    readonly property real value: osdService ? osdService.value : 0
    readonly property bool muted: osdService ? osdService.muted : false
    readonly property color textColor: !colors ? "transparent" : muted ? colors.base08 : colors.base05

    RowLayout {
        anchors.fill: parent
        spacing: root.osdConfig ? root.osdConfig.spacing : 4

        Text {
            text: root.osdService ? root.osdService.icon : ""
            color: root.textColor
            font.family: root.fontsConfig ? root.fontsConfig.defaultFamily : ""
            font.pixelSize: root.fontsConfig ? root.fontsConfig.defaultSize : 14
            Layout.alignment: Qt.AlignVCenter
        }

        Rectangle {
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignVCenter
            Layout.preferredHeight: root.osdConfig ? root.osdConfig.progressBarHeight : 6
            radius: root.osdConfig ? root.osdConfig.progressBarCornerRadius : 3
            color: root.colors ? root.colors.base02 : "transparent"

            Rectangle {
                height: parent.height
                // Another tool can set volume above 100%; the fill stops at full.
                width: parent.width * Math.max(0, Math.min(1, root.value / 100))
                radius: parent.radius
                color: root.osdService ? root.osdService.fillColor : "transparent"
            }
        }

        Text {
            id: percentText
            text: Math.round(root.value) + "%"
            color: root.textColor
            font.family: root.fontsConfig ? root.fontsConfig.defaultFamily : ""
            font.pixelSize: root.fontsConfig ? root.fontsConfig.defaultSize : 14
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
