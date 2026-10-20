pragma Singleton

import QtQuick
import Quickshell
import "../Common"

// One shared instance owns the volume and brightness controls and the mini OSD
// state. Every bar's clock slot binds to it, so all screens show the same OSD.
// Volume pushes state; brightness re-reads before stepping, so no polling is needed.
// Without a backlight device, the brightness functions do nothing and show no OSD.
Singleton {
    id: root

    property alias brightnessControl: brightnessCtl
    property alias volumeControl: volumeCtl

    // True while the mini OSD shows.
    property bool shown: false
    // "volume" or "brightness": the control that the mini OSD shows.
    property string kind: "volume"

    readonly property bool isVolume: kind === "volume"
    readonly property real value: isVolume ? volumeCtl.volume : brightnessCtl.brightness
    readonly property bool muted: isVolume && volumeCtl.muted
    readonly property string icon: isVolume ? volumeCtl.icon : brightnessCtl.icon
    readonly property color fillColor: muted ? Config.colors.base12 : isVolume ? Config.colors.base0B : Config.colors.base0A

    Brightness {
        id: brightnessCtl
    }

    Volume {
        id: volumeCtl
    }

    Timer {
        id: hideTimer
        interval: Config.osd.hideInterval
        onTriggered: root.shown = false
    }

    function show(newKind) {
        root.kind = newKind;
        root.shown = true;
        hideTimer.restart();
    }

    function brightnessUp() {
        if (!brightnessCtl.available)
            return;
        brightnessCtl.increase(Config.steps.brightness);
        show("brightness");
    }

    function brightnessDown() {
        if (!brightnessCtl.available)
            return;
        brightnessCtl.decrease(Config.steps.brightness);
        show("brightness");
    }

    function brightnessShow() {
        if (!brightnessCtl.available)
            return;
        brightnessCtl.refresh();
        show("brightness");
    }

    function volumeUp() {
        volumeCtl.increase(Config.steps.volume);
        show("volume");
    }

    function volumeDown() {
        volumeCtl.decrease(Config.steps.volume);
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
