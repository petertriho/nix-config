import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

Item {
    id: root
    property var brightness: 0
    property QtObject colors: null
    property QtObject config: null

    Component.onCompleted: {
        getBrightness();
    }

    // Process for brightness control
    Process {
        id: brightnessProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
                    var current = parseInt(output);
                    maxBrightnessProcess.exec({
                        command: ["brightnessctl", "max"]
                    });
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

    function getBrightness() {
        brightnessProcess.exec({
            command: ["brightnessctl", "get"]
        });
        return brightness;
    }

    function setBrightness(value) {
        var clampedValue = Math.max(0, Math.min(100, value));
        brightness = clampedValue;
        Quickshell.execDetached({
            command: ["brightnessctl", "set", clampedValue.toString() + "%"]
        });
    }

    function increase() {
        var step = config ? config.steps.brightness : 5;
        setBrightness(Math.min(100, brightness + step));
    }

    function decrease() {
        var step = config ? config.steps.brightness : 5;
        setBrightness(Math.max(0, brightness - step));
    }
}