import QtQuick
import QtQuick.Layouts
import QtQuick.Controls

BaseModule {
    id: root

    hoverHighlight: true
    property var osdService
    readonly property string icon: osdService ? osdService.brightnessControl.icon : "󰃞"
    property QtObject intervalsConfig: parent.intervalsConfig

    text: icon

    onClicked: {
        if (osdService)
            osdService.brightnessShow();
    }
}
