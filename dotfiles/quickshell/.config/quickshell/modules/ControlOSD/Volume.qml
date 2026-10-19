import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import Quickshell.Services.Pipewire

Item {
    id: root
    // Bindings over the default Pipewire sink; setters write straight back.
    property PwNode sink: Pipewire.defaultAudioSink
    property real volume: (sink && sink.audio) ? Math.round(sink.audio.volume * 100) : 0
    property bool muted: (sink && sink.audio) ? sink.audio.muted : false
    property QtObject colors: null
    property QtObject thresholdsConfig: null

    readonly property string icon: {
        if (muted)
            return "󰖁";
        if (!thresholdsConfig || !thresholdsConfig.volume)
            return "󰕾";
        if (volume < thresholdsConfig.volume.low)
            return "󰕿";
        if (volume < thresholdsConfig.volume.medium)
            return "󰖀";
        return "󰕾";
    }

    PwObjectTracker {
        objects: [Pipewire.defaultAudioSink]
    }

    function setVolume(value) {
        if (!sink || !sink.audio)
            return;
        var clampedValue = Math.max(0, Math.min(100, value));
        sink.audio.volume = clampedValue / 100;
    }

    function toggleMute() {
        if (!sink || !sink.audio)
            return;
        sink.audio.muted = !sink.audio.muted;
    }

    function isMuted() {
        return muted;
    }

    function getVolume() {
        return volume;
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
