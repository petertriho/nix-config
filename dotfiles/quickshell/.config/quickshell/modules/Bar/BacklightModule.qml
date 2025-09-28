import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

BaseModule {
    id: root

    property real brightness: 0
    property string icon: "󰃞"
    property QtObject config: parent.config

    Timer {
        interval: config ? config.intervals.backlight : 3000
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
        var lowThreshold = config ? config.thresholds.brightness.low : 33;
        var mediumThreshold = config ? config.thresholds.brightness.medium : 66;

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
