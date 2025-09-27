import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Hyprland
import "."
import "modules"

PanelWindow {
    id: root
    visible: true
    color: "transparent"
    anchors {
        top: true
        left: true
        right: true
    }
    implicitHeight: 30
    exclusiveZone: 30

    Rectangle {
        anchors.fill: parent
        color: Colors.colors.bg
        opacity: 1.0

        Item {
            anchors.fill: parent
            anchors.margins: 4

            // Left modules - Workspaces
            WorkspacesModule {
                id: workspaces
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                height: parent.height
            }

            // Center modules
            ClockModule {
                id: clock
                anchors.centerIn: parent
            }

            // Right modules
            Row {
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                spacing: 4
                height: parent.height

                // TrayModule {
                //     id: tray
                //     height: parent.height
                // }

                CpuModule {
                    id: cpu
                    height: parent.height
                }

                MemoryModule {
                    id: memory
                    height: parent.height
                }

                TemperatureModule {
                    id: temperature
                    height: parent.height
                }

                BacklightModule {
                    id: backlight
                    height: parent.height
                }

                PulseAudioModule {
                    id: pulseaudio
                    height: parent.height
                }

                BatteryModule {
                    id: battery
                    height: parent.height
                }

                NetworkModule {
                    id: network
                    height: parent.height
                }
            }
        }
    }
}
