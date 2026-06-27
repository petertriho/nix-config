import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Hyprland
import Quickshell.Services.SystemTray
import Quickshell.Widgets

PanelWindow {
    id: root
    visible: true
    // focusable: true
    color: "transparent"
    anchors {
        top: true
        left: true
        right: true
    }
    implicitHeight: barConfig.height
    exclusiveZone: barConfig.exclusiveZone

    property QtObject colors
    property QtObject barConfig
    property QtObject moduleConfig
    property QtObject workspacesConfig
    property QtObject intervalsConfig
    property QtObject thresholdsConfig
    property QtObject stepsConfig
    property QtObject fontsConfig
    property QtObject popupsConfig
    property var windowIcons
    required property var notificationsManager

    PopupWindow {
        id: caffeinePicker
        visible: caffeine.showPicker
        grabFocus: true
        anchor.window: root
        anchor.edges: Edges.Bottom | Edges.Left
        anchor.rect.x: caffeine.globalX + (caffeine.width - width) / 2
        anchor.rect.y: root.height
        anchor.rect.width: 1
        anchor.rect.height: 1
        implicitWidth: pickerCol.width + popupsConfig.padding
        implicitHeight: pickerCol.height + popupsConfig.margin
        color: "transparent"

        Rectangle {
            anchors.fill: parent
            color: colors.bg
            border.color: colors.border
            radius: popupsConfig.cornerRadius

            Column {
                id: pickerCol
                anchors.centerIn: parent
                spacing: popupsConfig.itemSpacing

                Repeater {
                    model: [
                        {
                            label: "15m",
                            value: 15
                        },
                        {
                            label: "30m",
                            value: 30
                        },
                        {
                            label: "01h",
                            value: 60
                        },
                        {
                            label: "02h",
                            value: 120
                        },
                        {
                            label: "04h",
                            value: 240
                        },
                        {
                            label: "08h",
                            value: 480
                        }
                    ]

                    delegate: Rectangle {
                        width: pickerRow.width
                        height: pickerRow.height
                        color: pickerMouse.containsMouse ? colors.bg_highlight : "transparent"
                        radius: 2

                        Text {
                            id: pickerRow
                            text: modelData.label
                            color: colors.fg
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize
                            leftPadding: 8
                            rightPadding: 8
                            topPadding: 2
                            bottomPadding: 2
                        }

                        MouseArea {
                            id: pickerMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: caffeine.activateWithDuration(modelData.value)
                        }
                    }
                }
            }
        }

        Timer {
            id: pickerTimer
            interval: popupsConfig.timeoutMs
            running: caffeine.showPicker
            onTriggered: caffeine.showPicker = false
        }
    }

    PopupWindow {
        id: trayPopup
        visible: false
        grabFocus: true
        anchor.window: root
        anchor.edges: Edges.Bottom | Edges.Left
        anchor.rect.x: tray.globalX + (tray.width - width) / 2
        anchor.rect.y: root.height
        anchor.rect.width: 1
        anchor.rect.height: 1
        implicitWidth: trayRow.width + popupsConfig.padding
        implicitHeight: trayRow.height + popupsConfig.margin
        color: "transparent"
        onVisibleChanged: if (!visible)
            tray.expanded = false

        Timer {
            id: trayTimer
            interval: popupsConfig.timeoutMs
            running: tray.expanded
            onTriggered: tray.expanded = false
        }

        Rectangle {
            anchors.fill: parent
            color: colors.bg
            border.color: colors.border
            radius: popupsConfig.cornerRadius

            Row {
                id: trayRow
                anchors.centerIn: parent
                spacing: popupsConfig.itemSpacing

                Repeater {
                    model: SystemTray.items
                    delegate: Item {
                        readonly property int _iconSize: popupsConfig.trayIconSize > 0 ? popupsConfig.trayIconSize : fontsConfig.defaultSize + popupsConfig.trayIconOffset
                        readonly property int _pad: 8
                        width: _iconSize + _pad * 2
                        height: _iconSize + _pad * 2

                        Rectangle {
                            anchors.fill: parent
                            radius: 4
                            color: mouse.containsMouse ? colors.bg_highlight : "transparent"
                        }

                        IconImage {
                            id: icon
                            anchors.centerIn: parent
                            implicitSize: parent._iconSize
                            source: modelData.icon
                        }

                        MouseArea {
                            id: mouse
                            anchors.fill: parent
                            hoverEnabled: true
                            acceptedButtons: Qt.LeftButton | Qt.RightButton
                            onClicked: function (mse) {
                                const ix = mse.x - (width - icon.width) / 2;
                                const iy = mse.y - (height - icon.height) / 2;
                                if (mse.button === Qt.RightButton) {
                                    modelData.secondaryActivate(ix, iy);
                                } else {
                                    modelData.activate(ix, iy);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    PopupWindow {
        id: statsPopup
        visible: stats.showPopup
        anchor.window: root
        anchor.edges: Edges.Bottom | Edges.Left
        anchor.rect.x: stats.globalX + (stats.width - width) / 2
        anchor.rect.y: root.height
        anchor.rect.width: 1
        anchor.rect.height: 1
        implicitWidth: 440
        implicitHeight: statsPopupCol.height + popupsConfig.padding
        color: "transparent"

        readonly property int contentW: implicitWidth - popupsConfig.padding * 2
        readonly property int valueW: 64

        Rectangle {
            anchors.fill: parent
            color: colors.bg
            border.color: colors.border
            radius: popupsConfig.cornerRadius

            MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                onEntered: stats.holdPopup()
                onExited: stats.releasePopup()
            }

            Column {
                id: statsPopupCol
                anchors.centerIn: parent
                width: statsPopup.contentW
                spacing: 3

                // ---------- CPU ----------
                Text {
                    width: statsPopup.contentW
                    text: "<span style=\"color:" + colors.blue + "\">●</span>&nbsp;&nbsp;CPU"
                    textFormat: Text.RichText
                    color: colors.fg
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                }
                Row {
                    width: statsPopup.contentW
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Load"
                        color: colors.comment
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: stats.loadAvg
                        color: colors.fg
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
                        color: colors.comment
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: stats.processCount
                        color: colors.fg
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
                                model: stats.coreColumn(index)
                                delegate: Row {
                                    width: parent.width
                                    spacing: 4
                                    Text {
                                        text: "C" + modelData.core
                                        color: colors.comment
                                        font.family: fontsConfig.defaultFamily
                                        font.pixelSize: fontsConfig.defaultSize - 1
                                        width: 26
                                    }
                                    Rectangle {
                                        width: parent.width - 26 - 34 - 8
                                        height: 8
                                        radius: 2
                                        color: colors.bg_highlight
                                        anchors.verticalCenter: parent.verticalCenter
                                        Rectangle {
                                            width: Math.max(1, parent.width * modelData.usage / 100)
                                            height: parent.height
                                            radius: parent.radius
                                            color: modelData.usage > 80 ? colors.red : modelData.usage > 50 ? colors.yellow : colors.blue
                                        }
                                    }
                                    Text {
                                        text: Math.round(modelData.usage) + "%"
                                        color: colors.fg
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
                    color: colors.comment
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize - 2
                    topPadding: 2
                }
                Repeater {
                    model: stats.topCpuApps
                    delegate: Item {
                        width: statsPopup.contentW
                        height: cpuName.implicitHeight
                        Text {
                            id: cpuName
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.rightMargin: statsPopup.valueW + 8
                            text: modelData.name
                            color: colors.fg
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            elide: Text.ElideRight
                        }
                        Text {
                            anchors.right: parent.right
                            width: statsPopup.valueW
                            text: modelData.usage.toFixed(1) + "%"
                            color: colors.fg
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            horizontalAlignment: Text.AlignRight
                        }
                    }
                }

                Rectangle {
                    width: statsPopup.contentW
                    height: 1
                    color: colors.bg_highlight
                }

                // ---------- Memory ----------
                Text {
                    width: statsPopup.contentW
                    text: "<span style=\"color:" + colors.green + "\">●</span>&nbsp;&nbsp;Memory"
                    textFormat: Text.RichText
                    color: colors.fg
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                }
                Row {
                    width: statsPopup.contentW
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Used"
                        color: colors.comment
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: stats.usedMemory.toFixed(1) + "G / " + stats.totalMemory.toFixed(1) + "G"
                        color: colors.fg
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
                        color: colors.comment
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: stats.availableMemory.toFixed(1) + "G"
                        color: colors.green
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                        horizontalAlignment: Text.AlignRight
                    }
                }
                Row {
                    width: statsPopup.contentW
                    visible: stats.swapTotal > 0
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Swap"
                        color: colors.comment
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: stats.swapUsed.toFixed(1) + "G / " + stats.swapTotal.toFixed(1) + "G"
                        color: colors.comment
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                        horizontalAlignment: Text.AlignRight
                    }
                }
                Text {
                    width: statsPopup.contentW
                    text: "Top memory"
                    color: colors.comment
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize - 2
                    topPadding: 2
                }
                Repeater {
                    model: stats.topMemoryApps
                    delegate: Item {
                        width: statsPopup.contentW
                        height: memName.implicitHeight
                        Text {
                            id: memName
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.rightMargin: statsPopup.valueW + 8
                            text: modelData.name
                            color: colors.fg
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            elide: Text.ElideRight
                        }
                        Text {
                            anchors.right: parent.right
                            width: statsPopup.valueW
                            text: stats.formatMemoryMb(modelData.memoryMb)
                            color: colors.fg
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            horizontalAlignment: Text.AlignRight
                        }
                    }
                }

                Rectangle {
                    width: statsPopup.contentW
                    height: 1
                    color: colors.bg_highlight
                }

                // ---------- Temperature ----------
                Text {
                    width: statsPopup.contentW
                    text: "<span style=\"color:" + (stats.isCritical ? colors.red : colors.warning) + "\">●</span>&nbsp;&nbsp;Temperature"
                    textFormat: Text.RichText
                    color: colors.fg
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                }
                Row {
                    width: statsPopup.contentW
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Package"
                        color: colors.comment
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: Math.round(stats.temperature) + "°C"
                        color: stats.isCritical ? colors.red : colors.fg
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize
                        font.bold: true
                        horizontalAlignment: Text.AlignRight
                    }
                }

                Rectangle {
                    width: statsPopup.contentW
                    height: 1
                    color: colors.bg_highlight
                }

                // ---------- GPU ----------
                Text {
                    width: statsPopup.contentW
                    text: "<span style=\"color:" + colors.magenta + "\">●</span>&nbsp;&nbsp;GPU"
                    textFormat: Text.RichText
                    color: colors.fg
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                }
                Text {
                    width: statsPopup.contentW
                    visible: !stats.gpuAvailable
                    text: stats.gpuStatus
                    color: colors.warning
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize - 1
                    wrapMode: Text.WordWrap
                }
                Text {
                    width: statsPopup.contentW
                    visible: stats.gpuAvailable
                    text: stats.gpuName
                    color: colors.comment
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize - 1
                    elide: Text.ElideRight
                }
                Row {
                    width: statsPopup.contentW
                    visible: stats.gpuAvailable
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Usage"
                        color: colors.comment
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: Math.round(stats.gpuUsage) + "%"
                        color: colors.fg
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                        horizontalAlignment: Text.AlignRight
                    }
                }
                Row {
                    width: statsPopup.contentW
                    visible: stats.gpuAvailable
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "VRAM"
                        color: colors.comment
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: stats.gpuMemoryTotal > 0 ? stats.formatMemoryMb(stats.gpuMemoryUsed) + " / " + stats.formatMemoryMb(stats.gpuMemoryTotal) : "—"
                        color: colors.fg
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                        horizontalAlignment: Text.AlignRight
                    }
                }
                Row {
                    width: statsPopup.contentW
                    visible: stats.gpuAvailable
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: "Temperature"
                        color: colors.comment
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                    }
                    Text {
                        width: statsPopup.contentW * 0.5
                        text: Math.round(stats.gpuTemperature) + "°C"
                        color: colors.fg
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize - 1
                        horizontalAlignment: Text.AlignRight
                    }
                }
                Text {
                    width: statsPopup.contentW
                    visible: stats.gpuAvailable
                    text: "Processes"
                    color: colors.comment
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize - 2
                    topPadding: 2
                }
                Text {
                    width: statsPopup.contentW
                    visible: stats.gpuAvailable && stats.gpuApps.length === 0
                    text: "No process data"
                    color: colors.comment
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize - 1
                }
                Repeater {
                    model: stats.gpuApps
                    delegate: Item {
                        width: statsPopup.contentW
                        height: gpuName.implicitHeight
                        Text {
                            id: gpuName
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.rightMargin: statsPopup.valueW * 2 + 18
                            text: modelData.name
                            color: colors.fg
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            elide: Text.ElideRight
                        }
                        Row {
                            anchors.right: parent.right
                            spacing: 10
                            Text {
                                text: modelData.usage > 0 ? modelData.usage.toFixed(1) + "%" : "—"
                                color: colors.fg
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize - 1
                                width: statsPopup.valueW
                                horizontalAlignment: Text.AlignRight
                            }
                            Text {
                                text: stats.formatMemoryMb(modelData.memoryMb)
                                color: colors.fg
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

    PopupWindow {
        id: bluetoothPopup
        visible: bluetooth.showPopup
        grabFocus: true
        anchor.window: root
        anchor.edges: Edges.Bottom | Edges.Left
        anchor.rect.x: bluetooth.globalX + (bluetooth.width - width) / 2
        anchor.rect.y: root.height
        anchor.rect.width: 1
        anchor.rect.height: 1
        implicitWidth: 320
        implicitHeight: bluetoothPopupCol.height + popupMargin
        color: "transparent"
        onVisibleChanged: if (!visible)
            bluetooth.showPopup = false
        readonly property int popupTimeoutMs: popupsConfig ? popupsConfig.timeoutMs : 5000
        readonly property int popupPadding: popupsConfig ? popupsConfig.padding : 16
        readonly property int popupMargin: popupsConfig ? popupsConfig.margin : 8
        readonly property int popupCornerRadius: popupsConfig ? popupsConfig.cornerRadius : 4
        readonly property int popupItemSpacing: popupsConfig ? popupsConfig.itemSpacing : 4

        Timer {
            id: bluetoothTimer
            interval: bluetoothPopup.popupTimeoutMs
            running: bluetooth.showPopup
            onTriggered: bluetooth.showPopup = false
        }

        Rectangle {
            anchors.fill: parent
            color: colors.bg
            border.color: colors.border
            radius: bluetoothPopup.popupCornerRadius

            Column {
                id: bluetoothPopupCol
                anchors.centerIn: parent
                width: parent.width - bluetoothPopup.popupPadding
                spacing: bluetoothPopup.popupItemSpacing

                Text {
                    text: "Bluetooth"
                    color: colors.fg
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                }

                Text {
                    text: bluetooth.adapterText()
                    color: bluetooth.enabled ? colors.green : colors.comment
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    elide: Text.ElideRight
                    width: parent.width
                }

                Item {
                    width: 1
                    height: 4
                }

                Text {
                    text: "Connected"
                    color: colors.fg
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                    visible: bluetooth.connectedDevices.length > 0
                }

                Repeater {
                    model: bluetooth.connectedDevices
                    delegate: Row {
                        width: bluetoothPopupCol.width
                        spacing: 8

                        Text {
                            text: bluetooth.displayName(modelData)
                            color: colors.fg
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize
                            width: parent.width - 92
                            elide: Text.ElideRight
                        }

                        Text {
                            text: bluetooth.statusText(modelData)
                            color: colors.blue
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            width: 84
                            horizontalAlignment: Text.AlignRight
                            elide: Text.ElideRight
                        }
                    }
                }

                Text {
                    text: "No connected devices"
                    color: colors.comment
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    visible: bluetooth.connectedDevices.length === 0
                }

                Item {
                    width: 1
                    height: 4
                }

                Text {
                    text: "Paired"
                    color: colors.fg
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    font.bold: true
                    visible: bluetooth.pairedDevices.length > 0
                }

                Repeater {
                    model: bluetooth.pairedDevices
                    delegate: Row {
                        width: bluetoothPopupCol.width
                        spacing: 8

                        Text {
                            text: bluetooth.displayName(modelData)
                            color: modelData.connected ? colors.fg : colors.comment
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize
                            width: parent.width - 92
                            elide: Text.ElideRight
                        }

                        Text {
                            text: bluetooth.statusText(modelData)
                            color: modelData.connected ? colors.blue : colors.comment
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                            width: 84
                            horizontalAlignment: Text.AlignRight
                            elide: Text.ElideRight
                        }
                    }
                }

                Text {
                    text: bluetooth.available ? "No paired devices" : "Bluetooth adapter unavailable"
                    color: colors.comment
                    font.family: fontsConfig.defaultFamily
                    font.pixelSize: fontsConfig.defaultSize
                    visible: bluetooth.pairedDevices.length === 0
                }

                Item {
                    width: 1
                    height: 6
                }

                Rectangle {
                    width: parent.width
                    height: openBluemanText.height + 8
                    color: openBluemanMouse.containsMouse ? colors.bg_highlight : "transparent"
                    radius: 4

                    Text {
                        id: openBluemanText
                        anchors.centerIn: parent
                        text: "Open Blueman"
                        color: colors.fg
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize
                    }

                    MouseArea {
                        id: openBluemanMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: {
                            bluetooth.showPopup = false;
                            Quickshell.execDetached({
                                command: ["blueman-manager"]
                            });
                        }
                    }
                }
            }
        }
    }

    PopupWindow {
        id: calendarPopup
        visible: clock.showPopup
        anchor.window: root
        anchor.edges: Edges.Bottom | Edges.Left
        anchor.rect.x: clock.globalX + (clock.width - width) / 2
        anchor.rect.y: root.height
        anchor.rect.width: 1
        anchor.rect.height: 1
        implicitWidth: calendarCol.width + popupsConfig.padding
        implicitHeight: calendarCol.height + popupsConfig.margin
        color: "transparent"
        onVisibleChanged: if (!visible)
            clock.showPopup = false

        Rectangle {
            id: calendarBg
            anchors.fill: parent
            color: colors.bg
            border.color: colors.border
            radius: popupsConfig.cornerRadius

            // Single hover-only overlay on top of the whole popup.
            // acceptedButtons: NoButton lets clicks fall through to the
            // buttons/cells beneath while this surface reliably tracks
            // enter/leave (no nested-MouseArea hover thrashing).
            // onPositionChanged resolves the hovered cell + button flags ONCE
            // per move; children bind to those cheaply instead of each doing
            // their own coordinate transform.
            MouseArea {
                id: calHover
                anchors.fill: parent
                hoverEnabled: true
                acceptedButtons: Qt.NoButton
                z: 1000
                onEntered: clock.holdPopup()
                onExited: {
                    clock.releasePopup();
                    calendarBg.hoveredCellIndex = -1;
                    calendarBg.prevHovered = false;
                    calendarBg.nextHovered = false;
                    calendarBg.todayHovered = false;
                }
                onPositionChanged: function (mouse) {
                    var mx = mouse.x;
                    var my = mouse.y;
                    calendarBg.prevHovered = calendarBg.__contains(prevBtn, mx, my);
                    calendarBg.nextHovered = calendarBg.__contains(nextBtn, mx, my);
                    calendarBg.todayHovered = calendarBg.__contains(todayBtn, mx, my);
                    var o = dayGrid.mapToItem(calendarBg, 0, 0);
                    var relX = mx - o.x;
                    var relY = my - o.y;
                    var pitch = calendarBg.__gridPitch;
                    var cs = calendarBg.__cellSize;
                    if (relX < 0 || relY < 0 || relX >= dayGrid.width || relY >= dayGrid.height) {
                        calendarBg.hoveredCellIndex = -1;
                        return;
                    }
                    var col = Math.floor(relX / pitch);
                    var row = Math.floor(relY / pitch);
                    var cx = col * pitch;
                    var cy = row * pitch;
                    if (col >= 0 && col < 7 && row >= 0 && row < 6 && relX < cx + cs && relY < cy + cs)
                        calendarBg.hoveredCellIndex = row * 7 + col;
                    else
                        calendarBg.hoveredCellIndex = -1;
                }
            }

            readonly property int __cellSize: fontsConfig.defaultSize + 22
            readonly property int __gridGap: 2
            readonly property int __gridPitch: __cellSize + __gridGap
            readonly property int __gridWidth: __cellSize * 7 + __gridGap * 6

            // Hover state, resolved once per move by calHover above.
            property int hoveredCellIndex: -1
            property bool prevHovered: false
            property bool nextHovered: false
            property bool todayHovered: false

            // Bounds check of a calendarBg-space point against an item.
            function __contains(item, mx, my) {
                var o = item.mapToItem(calendarBg, 0, 0);
                return mx >= o.x && my >= o.y && mx < o.x + item.width && my < o.y + item.height;
            }

            Column {
                id: calendarCol
                anchors.centerIn: parent
                spacing: popupsConfig.itemSpacing

                // Header: prev | month label | next
                Row {
                    width: calendarBg.__gridWidth
                    spacing: popupsConfig.itemSpacing

                    Rectangle {
                        id: prevBtn
                        width: calendarBg.__cellSize
                        height: calendarBg.__cellSize
                        color: calendarBg.prevHovered ? colors.bg_highlight : "transparent"
                        radius: 4
                        Text {
                            anchors.centerIn: parent
                            text: "‹"
                            color: colors.fg
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize + 2
                        }
                        MouseArea {
                            id: prevMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: clock.goPrevMonth()
                        }
                    }

                    Text {
                        width: calendarBg.__gridWidth - calendarBg.__cellSize * 2
                        height: calendarBg.__cellSize
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        text: clock.monthLabel
                        color: colors.fg
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize
                        font.bold: true
                        MouseArea {
                            anchors.fill: parent
                            onDoubleClicked: clock.goToday()
                        }
                    }

                    Rectangle {
                        id: nextBtn
                        width: calendarBg.__cellSize
                        height: calendarBg.__cellSize
                        color: calendarBg.nextHovered ? colors.bg_highlight : "transparent"
                        radius: 4
                        Text {
                            anchors.centerIn: parent
                            text: "›"
                            color: colors.fg
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize + 2
                        }
                        MouseArea {
                            id: nextMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: clock.goNextMonth()
                        }
                    }
                }

                // Weekday header
                Row {
                    width: calendarBg.__gridWidth
                    spacing: calendarBg.__gridGap
                    Repeater {
                        model: clock.weekdayLabels
                        delegate: Text {
                            width: calendarBg.__cellSize
                            height: calendarBg.__cellSize * 0.7
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                            text: modelData
                            color: colors.comment
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                        }
                    }
                }

                // Day grid (6 weeks x 7 days). Grid gives a uniform pitch so
                // the overlay can resolve the hovered cell from coordinates.
                Grid {
                    id: dayGrid
                    columns: 7
                    spacing: calendarBg.__gridGap
                    width: calendarBg.__gridWidth

                    Repeater {
                        model: 42
                        delegate: Rectangle {
                            id: dayCell
                            width: calendarBg.__cellSize
                            height: calendarBg.__cellSize
                            radius: 4
                            readonly property var cell: clock.cellModel[index]
                            color: {
                                if (!cell)
                                    return "transparent";
                                if (cell.isToday)
                                    return colors.blue;
                                if (index === calendarBg.hoveredCellIndex)
                                    return colors.bg_highlight;
                                return "transparent";
                            }

                            Text {
                                anchors.centerIn: parent
                                text: cell ? cell.day : ""
                                color: {
                                    if (!cell)
                                        return colors.fg;
                                    if (cell.isToday)
                                        return colors.bg_dark;
                                    return cell.inMonth ? colors.fg : colors.dark3;
                                }
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize
                                font.bold: cell && cell.isToday
                            }

                            MouseArea {
                                id: dayMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                onDoubleClicked: {
                                    if (cell && cell.isToday)
                                        clock.goToday();
                                }
                            }
                        }
                    }
                }

                // Today button
                Rectangle {
                    id: todayBtn
                    width: calendarBg.__gridWidth
                    height: todayText.implicitHeight + 8
                    color: calendarBg.todayHovered ? colors.bg_highlight : "transparent"
                    radius: 4
                    Text {
                        id: todayText
                        anchors.centerIn: parent
                        text: "Today"
                        color: colors.blue
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize
                    }
                    MouseArea {
                        id: todayMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: clock.goToday()
                    }
                }
            }
        }
    }

    Connections {
        target: tray
        function onExpandedChanged() {
            trayPopup.visible = tray.expanded;
        }
    }

    Rectangle {
        anchors.fill: parent
        color: colors.bg
        opacity: 1.0

        Item {
            anchors.fill: parent
            anchors.leftMargin: barConfig.contentMargins
            anchors.rightMargin: barConfig.contentMargins

            MouseArea {
                anchors.fill: parent
                z: -1
                onClicked: {
                    caffeine.showPicker = false;
                    tray.expanded = false;
                    stats.showPopup = false;
                    bluetooth.showPopup = false;
                    clock.showPopup = false;
                    if (notificationsManager)
                        notificationsManager.hideCenter();
                }
            }

            // Left modules
            VicinaeButton {
                id: applicationsLauncher
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                height: parent.height
                colors: root.colors
                moduleConfig: root.moduleConfig
                fontsConfig: root.fontsConfig
                icon: "󰀻"
                url: "vicinae://launch/applications"
                accentColor: colors.blue
            }

            WorkspacesModule {
                id: workspaces
                anchors.left: applicationsLauncher.right
                anchors.leftMargin: barConfig.moduleSpacing
                anchors.verticalCenter: parent.verticalCenter
                height: parent.height
                colors: root.colors
                workspacesConfig: root.workspacesConfig
                fontsConfig: root.fontsConfig
                windowIcons: root.windowIcons
            }

            // Center modules
            ClockModule {
                id: clock
                anchors.centerIn: parent
                colors: root.colors
                moduleConfig: root.moduleConfig
                intervalsConfig: root.intervalsConfig
                fontsConfig: root.fontsConfig
                popupsConfig: root.popupsConfig
            }

            // Right modules
            Row {
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: barConfig.moduleSpacing
                height: parent.height

                TrayModule {
                    id: tray
                    height: parent.height
                    barWindow: root
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    fontsConfig: root.fontsConfig
                }

                CaffeineModule {
                    id: caffeine
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    fontsConfig: root.fontsConfig
                }

                StatsModule {
                    id: stats
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    intervalsConfig: root.intervalsConfig
                    thresholdsConfig: root.thresholdsConfig
                    fontsConfig: root.fontsConfig
                }

                BacklightModule {
                    id: backlight
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    intervalsConfig: root.intervalsConfig
                    thresholdsConfig: root.thresholdsConfig
                    fontsConfig: root.fontsConfig
                }

                AudioModule {
                    id: pulseaudio
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    intervalsConfig: root.intervalsConfig
                    thresholdsConfig: root.thresholdsConfig
                    stepsConfig: root.stepsConfig
                    fontsConfig: root.fontsConfig
                }

                BatteryModule {
                    id: battery
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    intervalsConfig: root.intervalsConfig
                    thresholdsConfig: root.thresholdsConfig
                    fontsConfig: root.fontsConfig
                }

                BluetoothModule {
                    id: bluetooth
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    fontsConfig: root.fontsConfig
                    popupsConfig: root.popupsConfig
                }

                NetworkModule {
                    id: network
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    intervalsConfig: root.intervalsConfig
                    fontsConfig: root.fontsConfig
                }

                NotificationsModule {
                    id: notifications
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    fontsConfig: root.fontsConfig
                    notificationsManager: root.notificationsManager
                }

                VicinaeButton {
                    id: powerManagementLauncher
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    fontsConfig: root.fontsConfig
                    icon: "󰐥"
                    url: "vicinae://launch/power"
                    accentColor: colors.red
                }
            }
        }
    }
}
