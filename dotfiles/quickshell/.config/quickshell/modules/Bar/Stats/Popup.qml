import QtQuick
import "../../Common"

OverlayHost {
    id: statsPopup

    property var module
    property var barWindow
    property QtObject colors
    property QtObject fontsConfig
    property QtObject popupsConfig
    property QtObject overlayConfig
    animationDurationMs: overlayConfig ? overlayConfig.animationDurationMs : 180
    closeGraceMs: overlayConfig ? overlayConfig.closeGraceMs : 220
    screen: barWindow ? barWindow.screen : null
    open: module && module.showPopup
    onCloseRequested: if (module)
        module.showPopup = false

    readonly property int popupPadding: popupsConfig ? popupsConfig.padding : 16
    readonly property int popupMargin: popupsConfig ? popupsConfig.margin : 8
    readonly property int popupCornerRadius: popupsConfig ? popupsConfig.cornerRadius : 4
    readonly property int contentW: 440 - popupPadding * 2
    readonly property int valueW: 64

    Rectangle {
        id: statsCard
        readonly property real preferredHeight: statsPopupCol.implicitHeight + statsPopup.popupPadding
        readonly property real availableHeight: Math.max(1, (parent ? parent.height : preferredHeight) - y - statsPopup.popupMargin)

        width: 440
        height: Math.min(preferredHeight, availableHeight)
        x: module ? module.popupX(width) : 0
        y: (barWindow ? barWindow.height : 0) + 4
        color: colors.base01
        border.color: colors.base10
        radius: statsPopup.popupCornerRadius
        opacity: statsPopup.open ? 1.0 : 0.0
        scale: statsPopup.open ? 1.0 : 0.98
        transformOrigin: Item.Top

        Behavior on opacity {
            NumberAnimation {
                duration: statsPopup.animationDurationMs
            }
        }
        Behavior on scale {
            NumberAnimation {
                duration: statsPopup.animationDurationMs
            }
        }

        Flickable {
            id: statsFlick
            x: statsPopup.popupPadding
            y: statsPopup.popupPadding / 2
            width: Math.max(1, parent.width - statsPopup.popupPadding * 2)
            height: Math.max(1, parent.height - statsPopup.popupPadding)
            clip: true
            contentWidth: width
            contentHeight: statsPopupCol.implicitHeight
            boundsBehavior: Flickable.StopAtBounds
            interactive: contentHeight > height

            Column {
                id: statsPopupCol
                width: statsFlick.width
                spacing: 3

                // ---------- CPU ----------
                Text {
                    width: statsPopup.contentW
                    text: "<span style=\"color:" + colors.base0D + "\">●</span>&nbsp;&nbsp;CPU"
                    textFormat: Text.RichText
                    color: colors.base05
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                }
                Row {
                    width: statsPopup.contentW
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Load"
                        color: colors.base03
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: module.loadAvg
                        color: colors.base05
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                        horizontalAlignment: Text.AlignRight
                    }
                }
                Row {
                    width: statsPopup.contentW
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Processes"
                        color: colors.base03
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: module.processCount
                        color: colors.base05
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                        horizontalAlignment: Text.AlignRight
                    }
                }
                Row {
                    width: statsPopup.contentW
                    spacing: 12
                    Repeater {
                        model: 2
                        delegate: Column {
                            width: (statsPopup.contentW - 12) / 2
                            spacing: 2
                            Repeater {
                                model: module.coreColumn(index)
                                delegate: Row {
                                    width: parent.width
                                    spacing: 4
                                    Text {
                                        text: "C" + modelData.core
                                        color: colors.base03
                                        font.family: fontsConfig.defaultFamily
                                        font.pixelSize: fontsConfig.defaultSize - 1
                                        width: 26
                                    }
                                    Rectangle {
                                        width: parent.width - 26 - 34 - 8
                                        height: 8
                                        radius: 2
                                        color: colors.base02
                                        anchors.verticalCenter: parent.verticalCenter
                                        Rectangle {
                                            width: Math.max(1, parent.width * modelData.usage / 100)
                                            height: parent.height
                                            radius: parent.radius
                                            color: modelData.usage > 80 ? colors.base08 : modelData.usage > 50 ? colors.base0A : colors.base0D
                                        }
                                    }
                                    Text {
                                        text: Math.round(modelData.usage) + "%"
                                        color: colors.base05
                                        font.family: fontsConfig.defaultFamily
                                        font.pixelSize: fontsConfig.defaultSize - 1
                                        width: 34
                                        horizontalAlignment: Text.AlignRight
                                    }
                                }
                            }
                        }
                    }
                }
                Text {
                    width: statsPopup.contentW
                    text: "Top processes"
                    color: colors.base03
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize - 2
                    topPadding: 2
                }
                Repeater {
                    model: module.topCpuApps
                    delegate: Item {
                        width: statsPopup.contentW
                        height: cpuName.implicitHeight
                        Text {
                            id: cpuName
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.rightMargin: statsPopup.valueW + 8
                            text: modelData.name
                            color: colors.base05
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            elide: Text.ElideRight
                        }
                        Text {
                            anchors.right: parent.right
                            width: statsPopup.valueW
                            text: modelData.usage.toFixed(1) + "%"
                            color: colors.base05
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            horizontalAlignment: Text.AlignRight
                        }
                    }
                }

                Rectangle {
                    width: statsPopup.contentW
                    height: 1
                    color: colors.base02
                }

                // ---------- Memory ----------
                Text {
                    width: statsPopup.contentW
                    text: "<span style=\"color:" + colors.base0B + "\">●</span>&nbsp;&nbsp;Memory"
                    textFormat: Text.RichText
                    color: colors.base05
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                }
                Row {
                    width: statsPopup.contentW
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Used"
                        color: colors.base03
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: module.usedMemory.toFixed(1) + "G / " + module.totalMemory.toFixed(1) + "G"
                        color: colors.base05
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                        horizontalAlignment: Text.AlignRight
                    }
                }
                Row {
                    width: statsPopup.contentW
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Available"
                        color: colors.base03
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: module.availableMemory.toFixed(1) + "G"
                        color: colors.base0B
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                        horizontalAlignment: Text.AlignRight
                    }
                }
                Row {
                    width: statsPopup.contentW
                    visible: module.swapTotal > 0
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Swap"
                        color: colors.base03
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: module.swapUsed.toFixed(1) + "G / " + module.swapTotal.toFixed(1) + "G"
                        color: colors.base03
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                        horizontalAlignment: Text.AlignRight
                    }
                }
                Text {
                    width: statsPopup.contentW
                    text: "Top memory"
                    color: colors.base03
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize - 2
                    topPadding: 2
                }
                Repeater {
                    model: module.topMemoryApps
                    delegate: Item {
                        width: statsPopup.contentW
                        height: memName.implicitHeight
                        Text {
                            id: memName
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.rightMargin: statsPopup.valueW + 8
                            text: modelData.name
                            color: colors.base05
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            elide: Text.ElideRight
                        }
                        Text {
                            anchors.right: parent.right
                            width: statsPopup.valueW
                            text: module.formatMemoryMb(modelData.memoryMb)
                            color: colors.base05
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            horizontalAlignment: Text.AlignRight
                        }
                    }
                }

                Rectangle {
                    width: statsPopup.contentW
                    height: 1
                    color: colors.base02
                }

                // ---------- Temperature ----------
                Text {
                    width: statsPopup.contentW
                    text: "<span style=\"color:" + (module.isCritical ? colors.base08 : colors.base0A) + "\">●</span>&nbsp;&nbsp;Temperature"
                    textFormat: Text.RichText
                    color: colors.base05
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                }
                Row {
                    width: statsPopup.contentW
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Package"
                        color: colors.base03
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: Math.round(module.temperature) + "°C"
                        color: module.isCritical ? colors.base08 : colors.base05
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize
                        font.bold: true
                        horizontalAlignment: Text.AlignRight
                    }
                }

                Rectangle {
                    width: statsPopup.contentW
                    height: 1
                    color: colors.base02
                }

                // ---------- GPU ----------
                Text {
                    width: statsPopup.contentW
                    text: "<span style=\"color:" + colors.base0E + "\">●</span>&nbsp;&nbsp;GPU"
                    textFormat: Text.RichText
                    color: colors.base05
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                }
                Text {
                    width: statsPopup.contentW
                    visible: !module.gpuAvailable
                    text: module.gpuStatus
                    color: colors.base0A
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize - 1
                    wrapMode: Text.WordWrap
                }
                Text {
                    width: statsPopup.contentW
                    visible: module.gpuAvailable
                    text: module.gpuName
                    color: colors.base03
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize - 1
                    elide: Text.ElideRight
                }
                Row {
                    width: statsPopup.contentW
                    visible: module.gpuAvailable
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Usage"
                        color: colors.base03
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: Math.round(module.gpuUsage) + "%"
                        color: colors.base05
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                        horizontalAlignment: Text.AlignRight
                    }
                }
                Row {
                    width: statsPopup.contentW
                    visible: module.gpuAvailable
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "VRAM"
                        color: colors.base03
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: module.gpuMemoryTotal > 0 ? module.formatMemoryMb(module.gpuMemoryUsed) + " / " + module.formatMemoryMb(module.gpuMemoryTotal) : "—"
                        color: colors.base05
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                        horizontalAlignment: Text.AlignRight
                    }
                }
                Row {
                    width: statsPopup.contentW
                    visible: module.gpuAvailable
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Temperature"
                        color: colors.base03
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: Math.round(module.gpuTemperature) + "°C"
                        color: colors.base05
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                        horizontalAlignment: Text.AlignRight
                    }
                }
                Text {
                    width: statsPopup.contentW
                    visible: module.gpuAvailable
                    text: "Processes"
                    color: colors.base03
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize - 2
                    topPadding: 2
                }
                Text {
                    width: statsPopup.contentW
                    visible: module.gpuAvailable && module.gpuApps.length === 0
                    text: "No process data"
                    color: colors.base03
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize - 1
                }
                Repeater {
                    model: module.gpuApps
                    delegate: Item {
                        width: statsPopup.contentW
                        height: gpuName.implicitHeight
                        Text {
                            id: gpuName
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.rightMargin: statsPopup.valueW * 2 + 18
                            text: modelData.name
                            color: colors.base05
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            elide: Text.ElideRight
                        }
                        Row {
                            anchors.right: parent.right
                            spacing: 10
                            Text {
                                text: modelData.usage > 0 ? modelData.usage.toFixed(1) + "%" : "—"
                                color: colors.base05
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize - 1
                                width: statsPopup.valueW
                                horizontalAlignment: Text.AlignRight
                            }
                            Text {
                                text: module.formatMemoryMb(modelData.memoryMb)
                                color: colors.base05
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize - 1
                                width: statsPopup.valueW
                                horizontalAlignment: Text.AlignRight
                            }
                        }
                    }
                }
            }
        }
    }
}
