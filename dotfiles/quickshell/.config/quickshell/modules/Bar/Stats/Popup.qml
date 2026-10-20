pragma ComponentBehavior: Bound

import QtQuick
import "../../Common"

// Content of the stats popup. It reads StatsService only.
Column {
    id: root

    readonly property int coreColumnSpacing: 12

    spacing: Config.popups.itemSpacing

    function formatMemoryMb(mb: real): string {
        return mb >= 1024 ? (mb / 1024).toFixed(1) + "G" : Math.round(mb) + "M";
    }

    // A colored dot and the bold title of a section.
    component SectionHeader: Row {
        id: header

        property string title
        property color dotColor

        spacing: 8

        Text {
            text: "●"
            color: header.dotColor
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize
        }
        Text {
            text: header.title
            color: Config.colors.base05
            font.family: Config.fonts.defaultFamily
            font.pixelSize: Config.fonts.defaultSize
            font.bold: true
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

    // ---------- CPU ----------
    SectionHeader {
        title: "CPU"
        dotColor: Config.colors.base0D
    }
    StatRow {
        width: root.width
        label: "Load"
        value: StatsService.loadAvg
    }
    StatRow {
        width: root.width
        label: "Processes"
        value: StatsService.processCount
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
                        Rectangle {
                            width: coreRow.width - coreRow.labelWidth - coreRow.percentWidth - 2 * coreRow.spacing
                            height: 8
                            radius: 2
                            color: Config.colors.base02
                            anchors.verticalCenter: parent.verticalCenter

                            Rectangle {
                                width: Math.max(1, parent.width * coreRow.usage / 100)
                                height: parent.height
                                radius: parent.radius
                                color: coreRow.usage > 80 ? Config.colors.base08 : coreRow.usage > 50 ? Config.colors.base0A : Config.colors.base0D

                                Behavior on width {
                                    NumberAnimation {
                                        duration: 200
                                        easing.type: Easing.OutCubic
                                    }
                                }
                            }
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
    ListLabel {
        width: root.width
        text: "Top processes"
    }
    Repeater {
        model: StatsService.topCpuApps

        delegate: ProcessRow {
            required property var modelData

            width: root.width
            name: modelData.name
            usage: modelData.usage.toFixed(1) + "%"
        }
    }

    Separator {
        width: root.width
    }

    // ---------- Memory ----------
    SectionHeader {
        title: "Memory"
        dotColor: Config.colors.base0B
    }
    StatRow {
        width: root.width
        label: "Used"
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
        valueColor: Config.colors.base03
    }
    ListLabel {
        width: root.width
        text: "Top memory"
    }
    Repeater {
        model: StatsService.topMemoryApps

        delegate: ProcessRow {
            required property var modelData

            width: root.width
            name: modelData.name
            memory: root.formatMemoryMb(modelData.memoryMb)
        }
    }

    Separator {
        width: root.width
    }

    // ---------- Temperature ----------
    SectionHeader {
        title: "Temperature"
        dotColor: StatsService.temperatureCritical ? Config.colors.base08 : Config.colors.base0A
    }
    StatRow {
        width: root.width
        label: "Package"
        value: StatsService.temperatureAvailable ? Math.round(StatsService.temperature) + "°C" : "No sensor"
        valueColor: StatsService.temperatureCritical ? Config.colors.base08 : Config.colors.base05
        bold: true
    }

    Separator {
        width: root.width
    }

    // ---------- GPU ----------
    SectionHeader {
        title: "GPU"
        dotColor: Config.colors.base0E
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
    Text {
        width: root.width
        visible: StatsService.gpuAvailable
        text: StatsService.gpuName
        color: Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
        elide: Text.ElideRight
    }
    StatRow {
        width: root.width
        visible: StatsService.gpuAvailable
        label: "Usage"
        value: Math.round(StatsService.gpuUsage) + "%"
    }
    StatRow {
        width: root.width
        visible: StatsService.gpuAvailable
        label: "VRAM"
        value: StatsService.gpuMemoryTotal > 0 ? root.formatMemoryMb(StatsService.gpuMemoryUsed) + " / " + root.formatMemoryMb(StatsService.gpuMemoryTotal) : "—"
    }
    StatRow {
        width: root.width
        visible: StatsService.gpuAvailable
        label: "Temperature"
        value: Math.round(StatsService.gpuTemperature) + "°C"
    }
    ListLabel {
        width: root.width
        visible: StatsService.gpuAvailable
        text: "Processes"
    }
    Text {
        visible: StatsService.gpuAvailable && StatsService.gpuApps.length === 0
        text: "No process data"
        color: Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
    }
    Repeater {
        model: StatsService.gpuAvailable ? StatsService.gpuApps : []

        delegate: ProcessRow {
            required property var modelData

            width: root.width
            name: modelData.name
            usage: modelData.usage > 0 ? modelData.usage.toFixed(1) + "%" : "—"
            memory: root.formatMemoryMb(modelData.memoryMb)
        }
    }
}
