import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

BaseModule {
    id: root

    property real brightness: 0
    property string icon: "󰃞"
    property QtObject intervalsConfig: parent.intervalsConfig
    property QtObject thresholdsConfig: parent.thresholdsConfig

    Timer {
        interval: intervalsConfig.backlight
        repeat: true
        running: true
        onTriggered: updateBacklight()
    }

    Component.onCompleted: updateBacklight()

    Process {
        id: backlightProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    var match = output.match(/(\d+)%/);
                    if (match) {
                        brightness = parseInt(match[1]);
                        updateIcon();
                    }
                }
            }
        }
    }

    function updateBacklight() {
        backlightProcess.exec({
            command: ["brightnessctl", "info"]
        });
    }

    function updateIcon() {
        var lowThreshold = thresholdsConfig.brightness.low;
        var mediumThreshold = thresholdsConfig.brightness.medium;

        if (brightness < lowThreshold) {
            icon = "󰃞";
        } else if (brightness < mediumThreshold) {
            icon = "󰃟";
        } else {
            icon = "󰃠";
        }
    }

    text: icon

    onClicked: {
        Quickshell.execDetached({
            command: ["pwvucontrol"]
        });
    }
}
