import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

BaseModule {
    id: root

    property real brightness: 0
    property string icon: "󰃞"

    Timer {
        interval: 3000
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
        if (brightness < 33) {
            icon = "󰃞";
        } else if (brightness < 66) {
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
