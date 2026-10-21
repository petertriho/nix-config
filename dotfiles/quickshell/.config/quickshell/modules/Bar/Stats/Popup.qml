pragma ComponentBehavior: Bound

import QtQuick
import "../../Common"

// Content of the stats popup. It reads StatsService, and `module` for the
// settings footer.
Column {
    id: root

    property var module

    readonly property int coreColumnSpacing: 12
    readonly property int processRows: 5

    spacing: Config.popups.itemSpacing

    function formatMemoryMb(mb: real): string {
        return mb >= 1024 ? (mb / 1024).toFixed(1) + "G" : Math.round(mb) + "M";
    }

    function usageColor(value: real, normal: string): string {
        return StatsService.levelColor(value, Config.thresholds.usage, normal);
    }

    // The colored dot and the bold title on the left, then an optional dim
    // subtitle that elides. The HeaderValue children sit on the right.
    component SectionHeader: Item {
        id: header

        property string title
        property color dotColor
        property string subtitle: ""
        default property alias values: valueRow.data

        width: root.width
        implicitHeight: titleText.implicitHeight

        Text {
            id: dot
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: "●"
            color: header.dotColor
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize
        }
        Text {
            id: titleText
            anchors.left: dot.right
            anchors.leftMargin: 8
            anchors.verticalCenter: parent.verticalCenter
            text: header.title
            color: Config.colors.base05
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize
            font.bold: true
        }
        Text {
            anchors.left: titleText.right
            anchors.leftMargin: 8
            anchors.right: valueRow.left
            anchors.rightMargin: 8
            anchors.baseline: titleText.baseline
            text: header.subtitle
            color: Config.colors.base03
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize - 1
            elide: Text.ElideRight
        }
        Row {
            id: valueRow
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            spacing: 10
        }
    }

    // A value in a section header. At least as wide as `widestText`, so that
    // a change of digits does not move the values beside it.
    component HeaderValue: Text {
        id: headerValue

        property string widestText: ""

        width: Math.max(headerValue.implicitWidth, widestMetrics.advanceWidth)
        color: Config.colors.base05
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        horizontalAlignment: Text.AlignRight

        TextMetrics {
            id: widestMetrics
            font: headerValue.font
            text: headerValue.widestText
        }
    }

    // A small label above a process list.
    component ListLabel: Text {
        color: Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 2
        topPadding: 2
    }

    component Separator: Rectangle {
        height: 1
        color: Config.colors.base02
    }

    // A horizontal level bar, as in the core grid.
    component Meter: Rectangle {
        id: meter

        property real percent: 0
        property color fillColor: Config.colors.base0D

        height: 8
        radius: 2
        color: Config.colors.base02

        Rectangle {
            width: Math.max(1, meter.width * Math.max(0, Math.min(100, meter.percent)) / 100)
            height: parent.height
            radius: parent.radius
            color: meter.fillColor

            Behavior on width {
                NumberAnimation {
                    duration: 200
                    easing.type: Easing.OutCubic
                }
            }
        }
    }

    // The label, a Meter that fills the free width, then `value` on the right.
    component MeterRow: Item {
        id: meterRow

        property string label
        property real percent: 0
        property color fillColor: Config.colors.base0D
        property string value

        width: root.width
        implicitHeight: meterValue.implicitHeight

        Text {
            id: meterLabel
            anchors.left: parent.left
            anchors.verticalCenter: parent.verticalCenter
            text: meterRow.label
            color: Config.colors.base03
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize - 1
        }
        Meter {
            anchors.left: meterLabel.right
            anchors.leftMargin: 8
            anchors.right: meterValue.left
            anchors.rightMargin: 8
            anchors.verticalCenter: parent.verticalCenter
            percent: meterRow.percent
            fillColor: meterRow.fillColor
        }
        Text {
            id: meterValue
            anchors.right: parent.right
            anchors.verticalCenter: parent.verticalCenter
            text: meterRow.value
            color: Config.colors.base05
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize - 1
        }
    }

    // One process: the name on the left, then the right-aligned columns that
    // are not empty (usage, memory).
    component ProcessRow: Item {
        id: processRow

        property string name
        property string usage: ""
        property string memory: ""
        readonly property int valueWidth: 64

        implicitHeight: nameText.implicitHeight

        Text {
            id: nameText
            anchors.left: parent.left
            anchors.right: values.left
            anchors.rightMargin: 8
            text: processRow.name
            color: Config.colors.base05
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize - 1
            elide: Text.ElideRight
        }
        Row {
            id: values
            anchors.right: parent.right
            spacing: 10

            Text {
                visible: processRow.usage !== ""
                width: processRow.valueWidth
                text: processRow.usage
                color: Config.colors.base05
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize - 1
                horizontalAlignment: Text.AlignRight
            }
            Text {
                visible: processRow.memory !== ""
                width: processRow.valueWidth
                text: processRow.memory
                color: Config.colors.base05
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize - 1
                horizontalAlignment: Text.AlignRight
            }
        }
    }

    // The first `processRows` entries of `apps`, one row each. The model is a
    // count, so the rows stay across polls and only their values change.
    component ProcessList: Column {
        id: list

        property var apps: []
        // Keeps the height of all rows while `apps` is short or empty, so the
        // popup does not grow when the first CPU shares arrive.
        property bool reserveRows: false
        property bool showUsage: false
        property bool showMemory: false

        width: root.width
        spacing: Config.popups.itemSpacing

        Repeater {
            model: root.processRows

            delegate: ProcessRow {
                id: processItem

                required property int index
                readonly property var app: list.apps[processItem.index] || null

                width: list.width
                visible: processItem.app !== null || list.reserveRows
                name: processItem.app ? processItem.app.name : ""
                usage: processItem.app && list.showUsage ? processItem.app.usage.toFixed(1) + "%" : ""
                memory: processItem.app && list.showMemory ? root.formatMemoryMb(processItem.app.memoryMb) : ""
            }
        }
    }

    // ---------- CPU ----------
    SectionHeader {
        title: "CPU"
        dotColor: Config.colors.base0D

        HeaderValue {
            widestText: "100%"
            text: Math.round(StatsService.cpuUsage) + "%"
            color: root.usageColor(StatsService.cpuUsage, Config.colors.base05)
        }
        HeaderValue {
            visible: StatsService.temperatureAvailable
            widestText: "100°C"
            text: Math.round(StatsService.temperature) + "°C"
            color: StatsService.levelColor(StatsService.temperature, Config.thresholds.temperature, Config.colors.base05)
        }
    }
    HistoryGraph {
        width: root.width
        values: StatsService.cpuHistory
        lineColor: Config.colors.base0D
        secondaryValues: StatsService.cpuTemperatureHistory
        secondaryCritical: Config.thresholds.temperature.critical
    }
    // Two columns of cores. The models are core counts, so the rows stay
    // across polls and only their values change.
    Row {
        width: root.width
        spacing: root.coreColumnSpacing

        Repeater {
            model: 2

            delegate: Column {
                id: coreColumn

                required property int index
                // Cores in the first column.
                readonly property int half: Math.ceil(StatsService.coreCount / 2)

                width: (root.width - root.coreColumnSpacing) / 2
                spacing: 2

                Repeater {
                    model: coreColumn.index === 0 ? coreColumn.half : StatsService.coreCount - coreColumn.half

                    delegate: Row {
                        id: coreRow

                        required property int index
                        readonly property int core: coreColumn.index * coreColumn.half + coreRow.index
                        readonly property real usage: StatsService.perCoreUsage[coreRow.core] || 0
                        readonly property int labelWidth: 26
                        readonly property int percentWidth: 34

                        width: coreColumn.width
                        spacing: 4

                        Text {
                            width: coreRow.labelWidth
                            text: "C" + coreRow.core
                            color: Config.colors.base03
                            font.family: Config.fonts.defaultFamily
                            font.pixelSize: Config.fonts.defaultSize - 1
                        }
                        Meter {
                            width: coreRow.width - coreRow.labelWidth - coreRow.percentWidth - 2 * coreRow.spacing
                            anchors.verticalCenter: parent.verticalCenter
                            percent: coreRow.usage
                            fillColor: root.usageColor(coreRow.usage, Config.colors.base0D)
                        }
                        Text {
                            width: coreRow.percentWidth
                            text: Math.round(coreRow.usage) + "%"
                            color: Config.colors.base05
                            font.family: Config.fonts.defaultFamily
                            font.pixelSize: Config.fonts.defaultSize - 1
                            horizontalAlignment: Text.AlignRight
                        }
                    }
                }
            }
        }
    }
    StatRow {
        width: root.width
        label: "Load (1/5/15 min)"
        value: StatsService.loadAvg
    }
    StatRow {
        width: root.width
        label: "Tasks"
        value: StatsService.runningTasks + " running / " + StatsService.totalTasks
    }
    ListLabel {
        width: root.width
        text: "Top processes"
    }
    ProcessList {
        apps: StatsService.topCpuApps
        reserveRows: true
        showUsage: true
    }

    Separator {
        width: root.width
    }

    // ---------- Memory ----------
    SectionHeader {
        title: "Memory"
        dotColor: Config.colors.base0B

        HeaderValue {
            widestText: "100%"
            text: Math.round(StatsService.memoryUsage) + "%"
            color: root.usageColor(StatsService.memoryUsage, Config.colors.base05)
        }
    }
    HistoryGraph {
        width: root.width
        values: StatsService.memoryHistory
        lineColor: Config.colors.base0B
    }
    MeterRow {
        label: "RAM"
        percent: StatsService.memoryUsage
        fillColor: root.usageColor(StatsService.memoryUsage, Config.colors.base0B)
        value: StatsService.usedMemory.toFixed(1) + "G / " + StatsService.totalMemory.toFixed(1) + "G"
    }
    StatRow {
        width: root.width
        label: "Available"
        value: StatsService.availableMemory.toFixed(1) + "G"
        valueColor: Config.colors.base0B
    }
    StatRow {
        width: root.width
        visible: StatsService.swapTotal > 0
        label: "Swap"
        value: StatsService.swapUsed.toFixed(1) + "G / " + StatsService.swapTotal.toFixed(1) + "G"
    }
    ListLabel {
        width: root.width
        text: "Top memory"
    }
    ProcessList {
        apps: StatsService.topMemoryApps
        reserveRows: true
        showMemory: true
    }

    Separator {
        width: root.width
    }

    // ---------- GPU ----------
    SectionHeader {
        title: "GPU"
        dotColor: Config.colors.base0E
        subtitle: StatsService.gpuAvailable ? StatsService.gpuName : ""

        HeaderValue {
            visible: StatsService.gpuAvailable
            widestText: "100%"
            text: Math.round(StatsService.gpuUsage) + "%"
            color: root.usageColor(StatsService.gpuUsage, Config.colors.base05)
        }
        HeaderValue {
            visible: StatsService.gpuAvailable && StatsService.gpuTemperatureAvailable
            widestText: "100°C"
            text: Math.round(StatsService.gpuTemperature) + "°C"
            color: StatsService.levelColor(StatsService.gpuTemperature, Config.thresholds.gpuTemperature, Config.colors.base05)
        }
    }
    Text {
        width: root.width
        visible: !StatsService.gpuAvailable
        text: StatsService.gpuStatus
        color: Config.colors.base0A
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
        wrapMode: Text.WordWrap
    }
    HistoryGraph {
        width: root.width
        visible: StatsService.gpuAvailable
        values: StatsService.gpuHistory
        lineColor: Config.colors.base0E
        secondaryValues: StatsService.gpuTemperatureHistory
        secondaryCritical: Config.thresholds.gpuTemperature.critical
    }
    MeterRow {
        id: vramRow

        visible: StatsService.gpuAvailable && StatsService.gpuMemoryTotal > 0
        label: "VRAM"
        percent: StatsService.gpuMemoryUsed / StatsService.gpuMemoryTotal * 100
        fillColor: root.usageColor(vramRow.percent, Config.colors.base0E)
        value: root.formatMemoryMb(StatsService.gpuMemoryUsed) + " / " + root.formatMemoryMb(StatsService.gpuMemoryTotal)
    }
    ListLabel {
        width: root.width
        visible: StatsService.gpuAvailable
        text: "Processes"
    }
    Text {
        visible: StatsService.gpuAvailable && StatsService.topGpuApps.length === 0
        text: "No process data"
        color: Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
    }
    ProcessList {
        visible: StatsService.gpuAvailable
        apps: StatsService.topGpuApps
        showUsage: StatsService.gpuAppUsageAvailable
        showMemory: true
    }
    SettingsFooter {
        width: root.width
        module: root.module
    }
}
