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
                        { label: "15m", value: 15 },
                        { label: "30m", value: 30 },
                        { label: "01h", value: 60 },
                        { label: "02h", value: 120 },
                        { label: "04h", value: 240 },
                        { label: "08h", value: 480 }
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
        onVisibleChanged: if (!visible) tray.expanded = false

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
                            onClicked: function(mse) {
                                const ix = mse.x - (width - icon.width) / 2
                                const iy = mse.y - (height - icon.height) / 2
                                if (mse.button === Qt.RightButton) {
                                    modelData.secondaryActivate(ix, iy)
                                } else {
                                    modelData.activate(ix, iy)
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
        implicitWidth: 430
        implicitHeight: statsPopupCol.height + popupsConfig.margin
        color: "transparent"

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
                spacing: 2
                padding: 8

                Text { text: "CPU " + Math.round(stats.cpuUsage) + "%"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize; font.bold: true }
                Text { text: "Load: " + stats.loadAvg; color: colors.comment; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize }
                Text { text: "Procs: " + stats.processCount; color: colors.comment; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize }
                Row {
                    width: 380
                    spacing: 12
                    Repeater {
                        model: 2
                        delegate: Item {
                            width: 184
                            height: coreColumn.height

                            Column {
                                id: coreColumn
                                width: parent.width
                                spacing: 2
                                Repeater {
                                    model: stats.coreColumn(index)
                                    delegate: Row {
                                        width: 184
                                        spacing: 4
                                        Text { text: "C" + modelData.core; color: colors.comment; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize - 1; width: 22 }
                                        Rectangle {
                                            width: 120
                                            height: 8
                                            color: colors.bg_highlight
                                            radius: 2
                                            anchors.verticalCenter: parent.verticalCenter

                                            Rectangle {
                                                width: Math.max(1, parent.width * modelData.usage / 100)
                                                height: parent.height
                                                color: modelData.usage > 80 ? colors.red : modelData.usage > 50 ? colors.yellow : colors.blue
                                                radius: parent.radius
                                            }
                                        }
                                        Text { text: Math.round(modelData.usage) + "%"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize - 1; width: 34 }
                                    }
                                }
                            }
                        }
                    }
                }
                Text { text: "Top CPU"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize; font.bold: true }
                Repeater {
                    model: stats.topCpuApps
                    delegate: Row {
                        spacing: 6
                        Text { text: modelData.name; color: colors.comment; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize - 1; width: 190; elide: Text.ElideRight }
                        Text { text: modelData.usage.toFixed(1) + "%"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize - 1; width: 50; horizontalAlignment: Text.AlignRight }
                    }
                }

                Item { width: 1; height: 6 }
                Text { text: "Memory"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize; font.bold: true }
                Text { text: "RAM: " + stats.usedMemory.toFixed(1) + "G / " + stats.totalMemory.toFixed(1) + "G"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize }
                Text { text: "Avail: " + stats.availableMemory.toFixed(1) + "G"; color: colors.green; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize }
                Text { text: stats.swapTotal > 0 ? "Swap: " + stats.swapUsed.toFixed(1) + "G / " + stats.swapTotal.toFixed(1) + "G" : ""; color: colors.comment; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize }
                Text { text: "Top Memory"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize; font.bold: true }
                Repeater {
                    model: stats.topMemoryApps
                    delegate: Row {
                        spacing: 6
                        Text { text: modelData.name; color: colors.comment; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize - 1; width: 170; elide: Text.ElideRight }
                        Text { text: stats.formatMemoryMb(modelData.memoryMb); color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize - 1; width: 50; horizontalAlignment: Text.AlignRight }
                    }
                }

                Item { width: 1; height: 6 }
                Text { text: "Temperature"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize; font.bold: true }
                Text { text: Math.round(stats.temperature) + "°C"; color: stats.isCritical ? colors.red : colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize + 2 }

                Item { width: 1; height: 6 }
                Text { text: stats.gpuAvailable ? "GPU (" + stats.gpuBackend + ")" : "GPU"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize; font.bold: true }
                Text { text: stats.gpuAvailable ? stats.gpuName : stats.gpuStatus; color: stats.gpuAvailable ? colors.comment : colors.yellow; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize; width: 390; elide: Text.ElideRight }
                Text { text: stats.gpuAvailable && stats.gpuBackends.length > 1 ? stats.gpuStatus : ""; color: colors.comment; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize }
                Text { text: stats.gpuAvailable ? "Usage: " + Math.round(stats.gpuUsage) + "%  Temp: " + Math.round(stats.gpuTemperature) + "°C" : ""; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize }
                Text { text: stats.gpuAvailable && stats.gpuMemoryTotal > 0 ? "VRAM: " + stats.formatMemoryMb(stats.gpuMemoryUsed) + " / " + stats.formatMemoryMb(stats.gpuMemoryTotal) : ""; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize }
                Text { text: stats.gpuAvailable ? "GPU Apps" : ""; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize; font.bold: true }
                Text { text: stats.gpuAvailable && stats.gpuApps.length === 0 ? "No process data" : ""; color: colors.comment; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize - 1 }
                Repeater {
                    model: stats.gpuApps
                    delegate: Row {
                        spacing: 6
                        Text { text: modelData.name; color: colors.comment; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize - 1; width: 190; elide: Text.ElideRight }
                        Text { text: modelData.usage > 0 ? modelData.usage.toFixed(1) + "%" : ""; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize - 1; width: 50; horizontalAlignment: Text.AlignRight }
                        Text { text: stats.formatMemoryMb(modelData.memoryMb); color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize - 1; width: 50; horizontalAlignment: Text.AlignRight }
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
        onVisibleChanged: if (!visible) bluetooth.showPopup = false
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

                Item { width: 1; height: 4 }

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

                Item { width: 1; height: 4 }

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

                Item { width: 1; height: 6 }

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
                            bluetooth.showPopup = false
                            Quickshell.execDetached({ command: ["blueman-manager"] })
                        }
                    }
                }
            }
        }
    }

    Connections {
        target: tray
        function onExpandedChanged() {
            trayPopup.visible = tray.expanded
        }
    }

    Rectangle {
        anchors.fill: parent
        color: colors.bg
        opacity: 1.0

        Item {
            anchors.fill: parent
            anchors.margins: barConfig.contentMargins

            MouseArea {
                anchors.fill: parent
                z: -1
                onClicked: {
                    caffeine.showPicker = false
                    tray.expanded = false
                    stats.showPopup = false
                    bluetooth.showPopup = false
                    if (notificationsManager)
                        notificationsManager.hideCenter()
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
