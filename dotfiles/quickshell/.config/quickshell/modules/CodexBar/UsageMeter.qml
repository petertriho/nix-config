import QtQuick
import QtQuick.Layouts

// UsageMeter — one labeled usage meter for Panel: a [label ......... %]
// row, an optional reset countdown, and a colored progress bar. Shared by the
// primary (5h) and secondary (weekly/monthly) quota windows and by the
// OpenRouter credits-used meter. Band colors mirror the panel's logic.
ColumnLayout {
    id: root

    property string labelText: ""
    property real percent: -1 // <0 => unknown; bar clamps to [0,100]
    property string resetShort: "—"
    property string resetFull: "—"
    property bool showReset: true
    required property QtObject colors
    required property QtObject fontsConfig

    function bandColor(p) {
        if (p < 0 || isNaN(p))
            return colors.base04;
        if (p >= 90)
            return colors.base08;
        if (p >= 70)
            return colors.base0A;
        return colors.base0B;
    }

    spacing: 2

    // Label ........ percent
    RowLayout {
        Layout.fillWidth: true
        spacing: 8

        Text {
            text: root.labelText
            color: colors.base05
            font.family: fontsConfig.defaultFamily
            font.pixelSize: fontsConfig.defaultSize - 1
            elide: Text.ElideRight
            Layout.fillWidth: true
        }

        Text {
            text: root.percent >= 0 ? Math.round(root.percent) + "%" : "—"
            color: root.bandColor(root.percent)
            font.family: fontsConfig.defaultFamily
            font.pixelSize: fontsConfig.defaultSize - 1
            font.bold: true
        }
    }

    // Reset countdown (hidden when there is no reset data)
    Text {
        Layout.fillWidth: true
        visible: root.showReset && root.resetShort !== "—" && root.resetShort.length > 0
        text: "resets " + root.resetShort + "  ·  " + root.resetFull
        color: colors.base04
        font.family: fontsConfig.defaultFamily
        font.pixelSize: fontsConfig.defaultSize - 2
    }

    // Meter bar
    Rectangle {
        Layout.fillWidth: true
        Layout.preferredHeight: 4
        radius: 2
        color: colors.base02

        Rectangle {
            width: parent.width * (root.percent < 0 ? 0 : Math.min(100, root.percent)) / 100
            height: parent.height
            radius: parent.radius
            color: root.bandColor(root.percent)
        }
    }
}
