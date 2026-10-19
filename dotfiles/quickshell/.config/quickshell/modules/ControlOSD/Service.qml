import QtQuick

// One shared instance owns the volume and brightness controls and the mini OSD
// state. Every bar's clock slot binds to it, so all screens show the same OSD.
// Volume pushes state; brightness re-reads before stepping, so no polling is needed.
Item {
    id: root

    property QtObject colors: null
    property QtObject osdConfig: null
    property QtObject stepsConfig: null
    property QtObject thresholdsConfig: null

    property alias brightnessControl: brightnessCtl
    property alias volumeControl: volumeCtl

    // `shown`, not `visible`: this Item is never rendered, and Item.visible
    // already has a meaning.
    property bool shown: false
    // "volume" or "brightness": the control that the mini OSD shows.
    property string kind: "volume"

    readonly property bool isVolume: kind === "volume"
    readonly property real value: isVolume ? volumeCtl.volume : brightnessCtl.brightness
    readonly property bool muted: isVolume && volumeCtl.muted
    readonly property string icon: isVolume ? volumeCtl.icon : brightnessCtl.icon
    readonly property color fillColor: !colors ? "transparent" : muted ? colors.base12 : isVolume ? colors.base0B : colors.base0A

    Brightness {
        id: brightnessCtl
        colors: root.colors
        thresholdsConfig: root.thresholdsConfig
    }

    Volume {
        id: volumeCtl
        colors: root.colors
        thresholdsConfig: root.thresholdsConfig
    }

    Timer {
        id: hideTimer
        interval: root.osdConfig ? root.osdConfig.hideInterval : 2000
        onTriggered: root.shown = false
    }

    function show(newKind) {
        root.kind = newKind;
        root.shown = true;
        hideTimer.restart();
    }

    function brightnessStep() {
        return root.stepsConfig ? root.stepsConfig.brightness : 5;
    }

    function volumeStep() {
        return root.stepsConfig ? root.stepsConfig.volume : 5;
    }

    function brightnessUp() {
        brightnessCtl.increase(brightnessStep());
        show("brightness");
    }

    function brightnessDown() {
        brightnessCtl.decrease(brightnessStep());
        show("brightness");
    }

    function brightnessShow() {
        brightnessCtl.getBrightness();
        show("brightness");
    }

    function volumeUp() {
        volumeCtl.increase(volumeStep());
        show("volume");
    }

    function volumeDown() {
        volumeCtl.decrease(volumeStep());
        show("volume");
    }

    function volumeMute() {
        volumeCtl.toggleMute();
        show("volume");
    }

    // Steps the control that the mini OSD shows. direction > 0 increases.
    function step(direction) {
        if (root.isVolume) {
            if (direction > 0)
                volumeUp();
            else
                volumeDown();
        } else {
            if (direction > 0)
                brightnessUp();
            else
                brightnessDown();
        }
    }
}
