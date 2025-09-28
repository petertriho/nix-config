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
    implicitHeight: config ? config.bar.height : 24
    exclusiveZone: config ? config.bar.exclusiveZone : 24

    // Accept colors from parent (will be set by shell.qml)
    property QtObject colors
    property QtObject config
    property var windowIcons

    Rectangle {
        anchors.fill: parent
        color: colors ? colors.bg : "#16161e"
        opacity: 1.0

        Item {
            anchors.fill: parent
            anchors.margins: config ? config.bar.contentMargins : 4

            // Left modules - Workspaces
            WorkspacesModule {
                id: workspaces
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                height: parent.height
                colors: root.colors
                config: root.config
                windowIcons: root.windowIcons
            }

            // Center modules
            ClockModule {
                id: clock
                anchors.centerIn: parent
                colors: root.colors
                config: root.config
            }

            // Right modules
            Row {
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: config ? config.bar.moduleSpacing : 4
                height: parent.height

                // TrayModule {
                //     id: tray
                //     height: parent.height
                // }

                CpuModule {
                    id: cpu
                    height: parent.height
                    colors: root.colors
                    config: root.config
                }

                MemoryModule {
                    id: memory
                    height: parent.height
                    colors: root.colors
                    config: root.config
                }

                TemperatureModule {
                    id: temperature
                    height: parent.height
                    colors: root.colors
                    config: root.config
                }

                BacklightModule {
                    id: backlight
                    height: parent.height
                    colors: root.colors
                    config: root.config
                }

                PulseAudioModule {
                    id: pulseaudio
                    height: parent.height
                    colors: root.colors
                    config: root.config
                }

                BatteryModule {
                    id: battery
                    height: parent.height
                    colors: root.colors
                    config: root.config
                }

                NetworkModule {
                    id: network
                    height: parent.height
                    colors: root.colors
                    config: root.config
                }
            }
        }
    }
}
