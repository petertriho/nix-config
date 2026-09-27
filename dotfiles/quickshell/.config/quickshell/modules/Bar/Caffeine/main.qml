import QtQuick
import QtQuick.Layouts
import Quickshell
import ".."
import "../../Common" as Common
import "." as Local

BaseModule {
    id: root

    hoverHighlight: true
    property var caffeineService
    property bool showPicker: false
    readonly property real globalX: popupAnchor.globalX
    property var barWindow: null
    property bool inOverflow: false
    property var overflowAnchorModule: null
    property QtObject popupsConfig: parent.popupsConfig
    property QtObject overlayConfig: parent.overlayConfig

    text: {
        if (!caffeineService || !caffeineService.active)
            return "󰾪";
        if (caffeineService.remainingSeconds > 0) {
            var m = Math.floor(caffeineService.remainingSeconds / 60);
            var h = Math.floor(m / 60);
            if (h > 0)
                return "󰅶 " + h + "h" + (m % 60 > 0 ? (m % 60) + "m" : "");
            return "󰅶 " + m + "m";
        }
        return "󰅶";
    }

    function activateWithDuration(minutes) {
        if (root.caffeineService)
            root.caffeineService.activateWithDuration(minutes);
        root.showPicker = false;
    }

    function popupAnchorX(popupWidth) {
        return popupAnchor.anchorX(popupWidth);
    }

    function closePopup() {
        root.showPicker = false;
    }

    Common.DeferredLoader {
        open: root.showPicker
        unloadDelay: root.overlayConfig ? root.overlayConfig.closeGraceMs + 20 : 250

        Local.Popup {
            module: root
            barWindow: root.barWindow
            colors: root.colors
            fontsConfig: root.fontsConfig
            popupsConfig: root.popupsConfig
            overlayConfig: root.overlayConfig
        }
    }

    PopupAnchor {
        id: popupAnchor
        module: root
        barWindow: root.barWindow
        inOverflow: root.inOverflow
        overflowAnchorModule: root.overflowAnchorModule
    }

    onXChanged: popupAnchor.updatePosition()
    onWidthChanged: popupAnchor.updatePosition()
    Component.onCompleted: popupAnchor.updatePosition()

    onClicked: {
        if (root.showPicker) {
            root.showPicker = false;
            return;
        }
        if (root.caffeineService)
            root.caffeineService.toggleIndefinite();
    }

    onRightClicked: {
        popupAnchor.updatePosition();
        root.showPicker = !root.showPicker;
    }

    signal activateWithMinutes(int minutes)
}
