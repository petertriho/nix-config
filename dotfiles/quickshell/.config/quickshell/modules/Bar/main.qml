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
    focusable: true
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

        Item {
            anchors.fill: parent
            focus: true
            Keys.onPressed: (event) => {
                if (event.key === Qt.Key_Escape) {
                    caffeine.showPicker = false
                    event.accepted = true
                }
            }
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

        Item {
            anchors.fill: parent
            Keys.onPressed: (event) => {
                if (event.key === Qt.Key_Escape) {
                    tray.expanded = false
                    event.accepted = true
                }
            }
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

        Item {
            anchors.fill: parent
            focus: true
            Keys.onPressed: (event) => {
                if (event.key === Qt.Key_Escape) {
                    tray.expanded = false
                    event.accepted = true
                }
            }
        }
    }

    PopupWindow {
        id: cpuPopup
        visible: cpu.showPopup
        anchor.window: root
        anchor.edges: Edges.Bottom | Edges.Left
        anchor.rect.x: cpu.globalX + (cpu.width - width) / 2
        anchor.rect.y: root.height
        anchor.rect.width: 1
        anchor.rect.height: 1
        implicitWidth: 260
        implicitHeight: cpuPopupCol.height + popupsConfig.margin
        color: "transparent"

        Rectangle {
            anchors.fill: parent
            color: colors.bg
            border.color: colors.border
            radius: popupsConfig.cornerRadius

            MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                onEntered: cpu.holdPopup()
                onExited: cpu.releasePopup()
            }

            Column {
                id: cpuPopupCol
                anchors.centerIn: parent
                spacing: 2
                padding: 8

                Text { text: "CPU " + Math.round(cpu.cpuUsage) + "%"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize; font.bold: true }
                Text { text: "Load: " + cpu.loadAvg; color: colors.comment; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize }
                Text { text: "Procs: " + cpu.processCount; color: colors.comment; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize }
                Item { width: 1; height: 4 }
                Repeater {
                    model: cpu.perCoreUsage
                    delegate: Row {
                        spacing: 4
                        Text { text: "C" + modelData.core; color: colors.comment; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize - 1; width: 22 }
                        Rectangle { width: Math.max(1, modelData.usage * 1.8); height: 8; color: modelData.usage > 80 ? colors.red : modelData.usage > 50 ? colors.yellow : colors.blue; radius: 2; anchors.verticalCenter: parent.verticalCenter }
                        Text { text: Math.round(modelData.usage) + "%"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize - 1 }
                    }
                }
            }
        }
    }

    PopupWindow {
        id: memoryPopup
        visible: memory.showPopup
        anchor.window: root
        anchor.edges: Edges.Bottom | Edges.Left
        anchor.rect.x: memory.globalX + (memory.width - width) / 2
        anchor.rect.y: root.height
        anchor.rect.width: 1
        anchor.rect.height: 1
        implicitWidth: 220
        implicitHeight: memoryPopupCol.height + popupsConfig.margin
        color: "transparent"

        Rectangle {
            anchors.fill: parent
            color: colors.bg
            border.color: colors.border
            radius: popupsConfig.cornerRadius

            MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                onEntered: memory.holdPopup()
                onExited: memory.releasePopup()
            }

            Column {
                id: memoryPopupCol
                anchors.centerIn: parent
                spacing: 2
                padding: 8

                Text { text: "Memory"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize; font.bold: true }
                Text { text: "RAM: " + memory.usedMemory.toFixed(1) + "G / " + memory.totalMemory.toFixed(1) + "G"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize }
                Text { text: "Avail: " + memory.availableMemory.toFixed(1) + "G"; color: colors.green; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize }
                Text { text: memory.swapTotal > 0 ? "Swap: " + memory.swapUsed.toFixed(1) + "G / " + memory.swapTotal.toFixed(1) + "G" : ""; color: colors.comment; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize }
            }
        }
    }

    PopupWindow {
        id: temperaturePopup
        visible: temperature.showPopup
        anchor.window: root
        anchor.edges: Edges.Bottom | Edges.Left
        anchor.rect.x: temperature.globalX + (temperature.width - width) / 2
        anchor.rect.y: root.height
        anchor.rect.width: 1
        anchor.rect.height: 1
        implicitWidth: 180
        implicitHeight: tempPopupCol.height + popupsConfig.margin
        color: "transparent"

        Rectangle {
            anchors.fill: parent
            color: colors.bg
            border.color: colors.border
            radius: popupsConfig.cornerRadius

            MouseArea {
                anchors.fill: parent
                hoverEnabled: true
                onEntered: temperature.holdPopup()
                onExited: temperature.releasePopup()
            }

            Column {
                id: tempPopupCol
                anchors.centerIn: parent
                spacing: 2
                padding: 8

                Text { text: "Temperature"; color: colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize; font.bold: true }
                Text { text: Math.round(temperature.temperature) + "°C"; color: temperature.isCritical ? colors.red : colors.fg; font.family: fontsConfig.defaultFamily; font.pixelSize: fontsConfig.defaultSize + 4 }
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
                    cpu.showPopup = false
                    memory.showPopup = false
                    temperature.showPopup = false
                    if (notificationsManager)
                        notificationsManager.hideCenter()
                }
            }

            // Left modules - Workspaces
            WorkspacesModule {
                id: workspaces
                anchors.left: parent.left
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

                CpuModule {
                    id: cpu
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    intervalsConfig: root.intervalsConfig
                    thresholdsConfig: root.thresholdsConfig
                    fontsConfig: root.fontsConfig
                }

                MemoryModule {
                    id: memory
                    height: parent.height
                    colors: root.colors
                    moduleConfig: root.moduleConfig
                    intervalsConfig: root.intervalsConfig
                    thresholdsConfig: root.thresholdsConfig
                    fontsConfig: root.fontsConfig
                }

                TemperatureModule {
                    id: temperature
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
            }
        }
    }

    Item {
        anchors.fill: parent
        focus: true
        Keys.onPressed: (event) => {
            if (event.key === Qt.Key_Escape) {
                caffeine.showPicker = false
                tray.expanded = false
                cpu.showPopup = false
                memory.showPopup = false
                temperature.showPopup = false
                if (notificationsManager)
                    notificationsManager.hideCenter()
                event.accepted = true
            }
        }
    }
}
