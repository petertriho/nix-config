import QtQuick
import Quickshell.Services.Pipewire
import "../Common"

Item {
    id: root
    // Bindings over the default Pipewire sink and source; setters write
    // straight back.
    readonly property PwNode sink: Pipewire.defaultAudioSink
    // Percent. Another tool can set it above 100.
    readonly property real volume: (root.sink && root.sink.audio) ? Math.round(root.sink.audio.volume * 100) : 0
    readonly property bool muted: (root.sink && root.sink.audio) ? root.sink.audio.muted : false

    readonly property PwNode source: Pipewire.defaultAudioSource
    readonly property real sourceVolume: (root.source && root.source.audio) ? Math.round(root.source.audio.volume * 100) : 0
    readonly property bool sourceMuted: (root.source && root.source.audio) ? root.source.audio.muted : false
    readonly property string sourceIcon: root.sourceMuted ? "󰍭" : "󰍬"

    // Devices to pick the defaults from. App streams are left out.
    readonly property var sinks: Pipewire.nodes.values.filter(node => node.audio && node.isSink && !node.isStream)
    readonly property var sources: Pipewire.nodes.values.filter(node => node.audio && !node.isSink && !node.isStream)

    readonly property string icon: {
        if (root.muted)
            return "󰖁";
        if (root.volume < Config.thresholds.volume.low)
            return "󰕿";
        if (root.volume < Config.thresholds.volume.medium)
            return "󰖀";
        return "󰕾";
    }

    PwObjectTracker {
        objects: [root.sink, root.source]
    }

    function deviceName(node) {
        return node ? node.nickname || node.description || node.name : "";
    }

    function setDefaultSink(node) {
        Pipewire.preferredDefaultAudioSink = node;
    }

    function setDefaultSource(node) {
        Pipewire.preferredDefaultAudioSource = node;
    }

    function setSourceVolume(value) {
        if (!root.source || !root.source.audio)
            return;
        root.source.audio.volume = Math.max(0, value) / 100;
    }

    function toggleSourceMute() {
        if (!root.source || !root.source.audio)
            return;
        root.source.audio.muted = !root.source.audio.muted;
    }

    function setVolume(value) {
        if (!root.sink || !root.sink.audio)
            return;
        root.sink.audio.volume = Math.max(0, value) / 100;
    }

    function toggleMute() {
        if (!root.sink || !root.sink.audio)
            return;
        root.sink.audio.muted = !root.sink.audio.muted;
    }

    // Steps up to 100 % at most. A volume above 100 % stays as it is.
    function increase(step) {
        if (root.muted)
            root.toggleMute();
        if (root.volume < 100)
            root.setVolume(Math.min(100, root.volume + step));
    }

    // Steps down from the current volume, also from above 100 %.
    function decrease(step) {
        if (root.muted)
            root.toggleMute();
        root.setVolume(root.volume - step);
    }
}
