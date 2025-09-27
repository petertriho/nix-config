import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import Quickshell.Hyprland
import QtQuick.Dialogs

ShellRoot {
    id: root

    property var brightness: 0
    property var volume: 0
    property var muted: false

    Component.onCompleted: {
        // Initialize with current values
        getBrightness();
        getVolume();
        isMuted();

        // Set up periodic updates to sync with actual system state
        updateTimer.start();
    }

    Timer {
        id: updateTimer
        interval: 5000 // Update every 5 seconds
        repeat: true
        onTriggered: {
            getBrightness();
            getVolume();
            isMuted();
        }
    }

    // Process for brightness control
    Process {
        id: brightnessProcess
        stdout: StdioCollector {
            onStreamFinished: {
                // Parse brightness output - need to get both current and max
                var output = this.text.trim();
                if (output) {
                    var current = parseInt(output);
                    // Get max brightness
                    maxBrightnessProcess.exec({
                        command: ["brightnessctl", "max"]
                    });
                    // Store current value for max process callback
                    brightnessProcess.currentValue = current;
                }
            }
        }
        property int currentValue: 0
    }

    // Process for max brightness
    Process {
        id: maxBrightnessProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var maxOutput = this.text.trim();
                if (maxOutput) {
                    var max = parseInt(maxOutput);
                    brightness = Math.round((brightnessProcess.currentValue / max) * 100);
                }
            }
        }
    }

    // Process for volume control
    Process {
        id: volumeProcess
        stdout: StdioCollector {
            onStreamFinished: {
                // Parse volume output
                var output = this.text.trim();
                if (output) {
                    // Parse wpctl output format: "Volume: 0.55"
                    var match = output.match(/Volume: (\d+\.?\d*)/);
                    if (match) {
                        volume = Math.round(parseFloat(match[1]) * 100);
                    }
                }
            }
        }
    }

    // Process for mute status
    Process {
        id: muteProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    // Parse mute status - wpctl returns "MUTED" in the output
                    muted = output.includes("MUTED");
                }
            }
        }
    }

    function getBrightness() {
        brightnessProcess.exec({
            command: ["brightnessctl", "get"]
        });
        return brightness; // Return current value while process runs
    }

    function setBrightness(value) {
        var clampedValue = Math.max(0, Math.min(100, value));
        brightness = clampedValue; // Update UI immediately
        Quickshell.execDetached({
            command: ["brightnessctl", "set", clampedValue.toString() + "%"]
        });
    }

    function getVolume() {
        volumeProcess.exec({
            command: ["wpctl", "get-volume", "@DEFAULT_SINK@"]
        });
        return volume; // Return current value while process runs
    }

    function setVolume(value) {
        var clampedValue = Math.max(0, Math.min(100, value));
        volume = clampedValue; // Update UI immediately
        Quickshell.execDetached({
            command: ["wpctl", "set-volume", "@DEFAULT_SINK@", (clampedValue / 100).toString()]
        });
    }

    function toggleMute() {
        muted = !muted; // Toggle UI immediately
        Quickshell.execDetached({
            command: ["wpctl", "set-mute", "@DEFAULT_SINK@", "toggle"]
        });
    }

    function isMuted() {
        muteProcess.exec({
            command: ["wpctl", "get-volume", "@DEFAULT_SINK@"]
        });
        return muted; // Return current value while process runs
    }

    // Brightness OSD
    PanelWindow {
        id: brightnessOsd
        visible: false
        color: "transparent"
        anchors {
            bottom: true
        }
        margins {
            bottom: 50
        }
        exclusiveZone: -1

        implicitWidth: 300
        implicitHeight: 100

        Rectangle {
            anchors.fill: parent
            color: "#1e1e2e"
            radius: 10
            opacity: 0.9

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 20
                spacing: 10

                Text {
                    text: "Brightness"
                    color: "#cdd6f4"
                    font.pixelSize: 16
                    Layout.alignment: Qt.AlignHCenter
                }

                ProgressBar {
                    value: root.brightness / 100
                    Layout.fillWidth: true
                    Layout.preferredHeight: 20

                    background: Rectangle {
                        color: "#313244"
                        radius: 5
                    }

                    contentItem: Item {
                        Rectangle {
                            color: "#f9e2af"
                            radius: 5
                            height: parent.height
                            width: parent.width * (root.brightness / 100)
                        }
                    }
                }

                Text {
                    text: Math.round(root.brightness) + "%"
                    color: "#cdd6f4"
                    font.pixelSize: 14
                    Layout.alignment: Qt.AlignHCenter
                }
            }
        }

        Timer {
            id: brightnessTimer
            interval: 2000
            onTriggered: brightnessOsd.visible = false
        }
    }

    // Volume OSD
    PanelWindow {
        id: volumeOsd
        visible: false
        color: "transparent"
        anchors {
            bottom: true
        }
        margins {
            bottom: 50
        }
        exclusiveZone: -1

        implicitWidth: 300
        implicitHeight: 100

        Rectangle {
            anchors.fill: parent
            color: "#1e1e2e"
            radius: 10
            opacity: 0.9

            ColumnLayout {
                anchors.fill: parent
                anchors.margins: 20
                spacing: 10

                Text {
                    text: root.muted ? "Volume (Muted)" : "Volume"
                    color: root.muted ? "#f38ba8" : "#cdd6f4"
                    font.pixelSize: 16
                    Layout.alignment: Qt.AlignHCenter
                }

                ProgressBar {
                    value: root.volume / 100
                    Layout.fillWidth: true
                    Layout.preferredHeight: 20

                    background: Rectangle {
                        color: "#313244"
                        radius: 5
                    }

                    contentItem: Item {
                        Rectangle {
                            color: root.muted ? "#f38ba8" : "#a6e3a1"
                            radius: 5
                            height: parent.height
                            width: parent.width * (root.volume / 100)
                        }
                    }
                }

                Text {
                    text: Math.round(root.volume) + "%"
                    color: root.muted ? "#f38ba8" : "#cdd6f4"
                    font.pixelSize: 14
                    Layout.alignment: Qt.AlignHCenter
                }
            }
        }

        Timer {
            id: volumeTimer
            interval: 2000
            onTriggered: volumeOsd.visible = false
        }
    }

    // Global key bindings using Quickshell.Hyprland
    GlobalShortcut {
        name: "brightness-up"
        description: "Increase brightness"
        appid: "quickshell-osd"

        onPressed: {
            root.setBrightness(Math.min(100, root.brightness + 5));
            brightnessOsd.visible = true;
            brightnessTimer.restart();
        }
    }

    GlobalShortcut {
        name: "brightness-down"
        description: "Decrease brightness"
        appid: "quickshell-osd"

        onPressed: {
            root.setBrightness(Math.max(0, root.brightness - 5));
            brightnessOsd.visible = true;
            brightnessTimer.restart();
        }
    }

    GlobalShortcut {
        name: "volume-up"
        description: "Increase volume"
        appid: "quickshell-osd"

        onPressed: {
            if (root.muted)
                root.toggleMute();
            root.setVolume(Math.min(100, root.volume + 5));
            volumeOsd.visible = true;
            volumeTimer.restart();
        }
    }

    GlobalShortcut {
        name: "volume-down"
        description: "Decrease volume"
        appid: "quickshell-osd"

        onPressed: {
            if (root.muted)
                root.toggleMute();
            root.setVolume(Math.max(0, root.volume - 5));
            volumeOsd.visible = true;
            volumeTimer.restart();
        }
    }

    GlobalShortcut {
        name: "volume-mute"
        description: "Toggle mute"
        appid: "quickshell-osd"

        onPressed: {
            root.toggleMute();
            volumeOsd.visible = true;
            volumeTimer.restart();
        }
    }
}
