import QtQuick
import "../../Common"
import "../../ControlOSD"

// Content of the brightness popup: one slider. It reads the brightness again
// when it opens, because another tool can change it.
Column {
    id: root

    readonly property Brightness brightness: OsdService.brightnessControl

    // Every set starts a brightnessctl process. During a drag, the slider sets
    // the first value at once, then at most one value per interval.
    property real pendingValue: -1

    spacing: Config.popups.itemSpacing

    function apply(value: real): void {
        if (throttle.running) {
            root.pendingValue = value;
            return;
        }
        root.brightness.setBrightness(value);
        throttle.start();
    }

    Timer {
        id: throttle
        interval: 50
        onTriggered: {
            if (root.pendingValue < 0)
                return;
            root.brightness.setBrightness(root.pendingValue);
            root.pendingValue = -1;
            throttle.start();
        }
    }

    Component.onCompleted: root.brightness.refresh()

    Text {
        text: "Brightness"
        color: Config.colors.base05
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        font.bold: true
    }

    PopupSlider {
        width: root.width
        value: root.brightness.brightness
        icon: root.brightness.icon
        fillColor: Config.colors.base0A
        step: Config.steps.brightness
        onMoved: value => root.apply(value)
    }
}
