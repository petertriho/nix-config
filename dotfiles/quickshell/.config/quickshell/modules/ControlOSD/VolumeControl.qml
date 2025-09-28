import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell
import Quickshell.Io

Item {
    id: root
    property var volume: 0
    property var muted: false
    property QtObject colors: null

    Component.onCompleted: {
        getVolume();
        isMuted();
    }

    // Process for volume control
    Process {
        id: volumeProcess
        stdout: StdioCollector {
            onStreamFinished: {
                var output = this.text.trim();
                if (output) {
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
                    muted = output.includes("MUTED");
                }
            }
        }
    }

    function getVolume() {
        volumeProcess.exec({
            command: ["wpctl", "get-volume", "@DEFAULT_SINK@"]
        });
        return volume;
    }

    function setVolume(value) {
        var clampedValue = Math.max(0, Math.min(100, value));
        volume = clampedValue;
        Quickshell.execDetached({
            command: ["wpctl", "set-volume", "@DEFAULT_SINK@", (clampedValue / 100).toString()]
        });
    }

    function toggleMute() {
        muted = !muted;
        Quickshell.execDetached({
            command: ["wpctl", "set-mute", "@DEFAULT_SINK@", "toggle"]
        });
    }

    function isMuted() {
        muteProcess.exec({
            command: ["wpctl", "get-volume", "@DEFAULT_SINK@"]
        });
        return muted;
    }

    function increase(step) {
        if (muted)
            toggleMute();
        var stepValue = step || 5;
        setVolume(Math.min(100, volume + stepValue));
    }

    function decrease(step) {
        if (muted)
            toggleMute();
        var stepValue = step || 5;
        setVolume(Math.max(0, volume - stepValue));
    }
}
