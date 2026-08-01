import QtQuick
import QtQuick.Layouts

// UsageMeter — one labeled usage meter for Panel: a [label ......... %]
// row, an optional reset countdown, a colored progress bar, and optional pacing
// marker/details. Shared by the compacted quota windows (up to three) and by the
// OpenRouter credits-used meter, which leaves pacing unbound.
ColumnLayout {
    id: root

    property string labelText: ""
    property real percent: -1 // <0 => unknown; bar clamps to [0,100]
    property string resetShort: "—"
    property string resetFull: "—"
    property bool showReset: true
    property real paceExpectedPercent: -1
    property string paceState: ""
    property string paceSummary: ""
    property string paceProjection: ""
    required property QtObject colors
    required property QtObject fontsConfig

    readonly property bool paceAvailable: paceState.length > 0 && paceSummary.length > 0
    readonly property bool markerVisible: paceAvailable
        && (paceState === "reserve" || paceState === "deficit")
        && paceExpectedPercent >= 0 && paceExpectedPercent <= 100

    function bandColor(p) {
        if (p < 0 || isNaN(p))
            return colors.base03;
        if (p >= 90)
            return colors.base08;
        if (p >= 70)
            return colors.base0A;
        return colors.base0B;
    }

    function paceColor(state) {
        if (state === "reserve")
            return colors.base0B;
        if (state === "deficit")
            return colors.base08;
        return colors.base03;
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
        color: colors.base03
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

        Item {
            visible: root.markerVisible
            x: Math.max(0, Math.min(parent.width - width,
                parent.width * root.paceExpectedPercent / 100 - width / 2))
            width: 3
            height: parent.height

            Rectangle {
                anchors.fill: parent
                color: root.colors.base06
            }

            Rectangle {
                anchors.horizontalCenter: parent.horizontalCenter
                width: 1
                height: parent.height
                color: root.paceColor(root.paceState)
            }
        }
    }

    // Reserve/deficit summary and projected exhaustion for eligible windows.
    RowLayout {
        Layout.fillWidth: true
        visible: root.paceAvailable
        spacing: 8

        Text {
            text: root.paceSummary
            color: root.paceColor(root.paceState)
            font.family: root.fontsConfig.defaultFamily
            font.pixelSize: root.fontsConfig.defaultSize - 2
            Layout.fillWidth: true
            elide: Text.ElideRight
        }

        Text {
            visible: root.paceProjection.length > 0
            text: root.paceProjection
            color: root.colors.base03
            font.family: root.fontsConfig.defaultFamily
            font.pixelSize: root.fontsConfig.defaultSize - 2
            elide: Text.ElideRight
            Layout.maximumWidth: root.width * 0.58
        }
    }
}
