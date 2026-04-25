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

    Process {
        id: backlightWatchProcess
        command: ["brightnessctl", "--watch"]
        running: true

        stdout: SplitParser {
            onRead: data => parseBacklightInfo(data)
        }
    }

    Component.onCompleted: updateBacklight()

    Process {
        id: backlightProcess
        stdout: StdioCollector {
            onStreamFinished: {
                parseBacklightInfo(this.text.trim());
            }
        }
    }

    function parseBacklightInfo(output) {
        if (!output)
            return;

        var match = output.match(/(\d+)%/);
        if (match) {
            brightness = parseInt(match[1]);
            updateIcon();
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
