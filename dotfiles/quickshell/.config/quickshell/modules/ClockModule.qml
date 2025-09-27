import QtQuick
import QtQuick.Layouts
import QtQuick.Controls

BaseModule {
    id: root

    Timer {
        interval: 1000
        repeat: true
        running: true
        onTriggered: updateTime()
    }

    Component.onCompleted: updateTime()

    function updateTime() {
        var now = new Date();
        var year = now.getFullYear();
        var month = String(now.getMonth() + 1).padStart(2, '0');
        var day = String(now.getDate()).padStart(2, '0');
        var hours = String(now.getHours()).padStart(2, '0');
        var minutes = String(now.getMinutes()).padStart(2, '0');

        text = year + "-" + month + "-" + day + " " + hours + ":" + minutes;
    }
}
