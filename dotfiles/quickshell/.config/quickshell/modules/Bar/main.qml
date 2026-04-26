import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Hyprland

PanelWindow {
    id: root
    visible: true
    color: "transparent"
    anchors {
        top: true
        left: true
        right: true
    }
    implicitHeight: barConfig.height
    exclusiveZone: barConfig.exclusiveZone

    // Accept colors from parent (will be set by shell.qml)
    property QtObject colors
    property QtObject barConfig
    property QtObject moduleConfig
    property QtObject workspacesConfig
    property QtObject intervalsConfig
    property QtObject thresholdsConfig
    property QtObject stepsConfig
    property QtObject fontsConfig
    property var windowIcons

    PopupWindow {
        id: caffeinePicker
        visible: caffeine.showPicker
        anchor.window: root
        anchor.edges: Edges.Bottom | Edges.Left
        anchor.rect.x: caffeine.globalX
        anchor.rect.y: root.height
        anchor.rect.width: caffeine.width
        anchor.rect.height: 1
        implicitWidth: pickerCol.width + 16
        implicitHeight: pickerCol.height + 8
        color: "transparent"

        Rectangle {
            anchors.fill: parent
            color: colors.bg
            border.color: colors.border
            radius: 4

            Column {
                id: pickerCol
                anchors.centerIn: parent
                spacing: 2

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
            interval: 5000
            running: caffeine.showPicker
            onTriggered: caffeine.showPicker = false
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
                onClicked: caffeine.showPicker = false
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

                // TrayModule {
                //     id: tray
                //     height: parent.height
                // }

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
            }
        }
    }
}
