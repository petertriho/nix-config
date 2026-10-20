pragma ComponentBehavior: Bound

import QtQuick
import "../../Common"

// Calendar content of the clock popup. "Today" follows the module clock. Each
// open starts at the current month. The wheel and a click on a grey day change
// the month.
Item {
    id: root

    property var module

    readonly property date today: root.module ? root.module.now : new Date()
    // Month in view (month 0-indexed).
    property int viewYear: 0
    property int viewMonth: 0
    readonly property bool weekStartsOnMonday: true

    readonly property int cellSize: Config.fonts.defaultSize + 22
    readonly property int gridGap: 2
    readonly property int gridWidth: root.cellSize * 7 + root.gridGap * 6

    readonly property var monthNames: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
    readonly property var weekdayLabels: root.weekStartsOnMonday ? ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

    // Six weeks of cells. `offset` is the month of the cell relative to the
    // view: -1, 0 or 1.
    readonly property var cells: {
        const first = new Date(root.viewYear, root.viewMonth, 1);
        const lead = root.weekStartsOnMonday ? (first.getDay() + 6) % 7 : first.getDay();
        const ty = root.today.getFullYear();
        const tm = root.today.getMonth();
        const td = root.today.getDate();
        const result = [];
        for (let i = 0; i < 42; i++) {
            const date = new Date(root.viewYear, root.viewMonth, i - lead + 1);
            const monthIndex = date.getFullYear() * 12 + date.getMonth();
            result.push({
                "day": date.getDate(),
                "offset": monthIndex - (root.viewYear * 12 + root.viewMonth),
                "isToday": date.getFullYear() === ty && date.getMonth() === tm && date.getDate() === td
            });
        }
        return result;
    }

    function shiftMonth(delta: int): void {
        const date = new Date(root.viewYear, root.viewMonth + delta, 1);
        root.viewYear = date.getFullYear();
        root.viewMonth = date.getMonth();
    }

    function goToday(): void {
        root.viewYear = root.today.getFullYear();
        root.viewMonth = root.today.getMonth();
    }

    implicitWidth: root.gridWidth
    implicitHeight: calendarCol.implicitHeight

    Component.onCompleted: root.goToday()

    // The overlay outlives a close by a short grace period, so a quick reopen
    // reuses this item.
    Connections {
        target: root.module
        function onPopupOpenChanged() {
            if (root.module.popupOpen)
                root.goToday();
        }
    }

    // One month per wheel notch (120 units), up = earlier. Touchpad deltas
    // accumulate until they reach a notch.
    property real wheelRemainder: 0

    WheelHandler {
        target: null
        acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
        onWheel: function (event) {
            root.wheelRemainder += event.angleDelta.y;
            while (Math.abs(root.wheelRemainder) >= 120) {
                const direction = root.wheelRemainder > 0 ? 1 : -1;
                root.shiftMonth(-direction);
                root.wheelRemainder -= direction * 120;
            }
        }
    }

    Column {
        id: calendarCol
        width: parent.width
        spacing: Config.popups.itemSpacing

        // Header: prev | month label | next
        Row {
            id: headerRow
            width: root.gridWidth
            spacing: Config.popups.itemSpacing

            Rectangle {
                width: root.cellSize
                height: root.cellSize
                radius: Config.style.radiusSmall
                color: prevMouse.containsMouse ? Config.style.hoverColor : "transparent"

                Text {
                    id: prevText
                    anchors.centerIn: parent
                    text: "‹"
                    color: Config.colors.base05
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.fonts.defaultSize + 2
                }

                MouseArea {
                    id: prevMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: root.shiftMonth(-1)
                }
            }

            Text {
                width: Math.max(1, root.gridWidth - root.cellSize * 2 - headerRow.spacing * 2)
                height: root.cellSize
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter
                text: root.monthNames[root.viewMonth] + " " + root.viewYear
                color: Config.colors.base05
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize
                font.bold: true

                MouseArea {
                    anchors.fill: parent
                    onDoubleClicked: root.goToday()
                }
            }

            Rectangle {
                width: root.cellSize
                height: root.cellSize
                radius: Config.style.radiusSmall
                color: nextMouse.containsMouse ? Config.style.hoverColor : "transparent"

                Text {
                    id: nextText
                    anchors.centerIn: parent
                    text: "›"
                    color: Config.colors.base05
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.fonts.defaultSize + 2
                }

                MouseArea {
                    id: nextMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    onClicked: root.shiftMonth(1)
                }
            }
        }

        // Weekday header
        Row {
            width: root.gridWidth
            spacing: root.gridGap

            Repeater {
                model: root.weekdayLabels
                delegate: Text {
                    required property string modelData

                    width: root.cellSize
                    height: root.cellSize * 0.7
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                    text: modelData
                    color: Config.colors.base03
                    font.family: Config.fonts.defaultFamily
                    font.pixelSize: Config.fonts.defaultSize - 1
                }
            }
        }

        // Day grid (6 weeks x 7 days)
        Grid {
            columns: 7
            spacing: root.gridGap
            width: root.gridWidth

            // An integer model keeps the delegates when the month changes.
            Repeater {
                model: 42
                delegate: Rectangle {
                    id: dayCell

                    required property int index
                    readonly property var modelData: root.cells[dayCell.index]

                    width: root.cellSize
                    height: root.cellSize
                    radius: Config.style.radiusSmall
                    color: dayCell.modelData.isToday ? Config.style.accentColor : dayMouse.containsMouse ? Config.style.hoverColor : "transparent"

                    Text {
                        anchors.centerIn: parent
                        text: dayCell.modelData.day
                        color: dayCell.modelData.isToday ? Config.colors.base01 : dayCell.modelData.offset === 0 ? Config.colors.base05 : Config.colors.base03
                        font.family: Config.fonts.defaultFamily
                        font.pixelSize: Config.fonts.defaultSize
                        font.bold: dayCell.modelData.isToday
                    }

                    // A grey day moves the view to its month.
                    MouseArea {
                        id: dayMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: {
                            if (dayCell.modelData.offset !== 0)
                                root.shiftMonth(dayCell.modelData.offset);
                        }
                    }
                }
            }
        }

        Rectangle {
            width: root.gridWidth
            height: todayText.implicitHeight + 8
            radius: Config.style.radiusSmall
            color: todayMouse.containsMouse ? Config.style.hoverColor : "transparent"

            Text {
                id: todayText
                anchors.centerIn: parent
                text: "Today"
                color: Config.style.accentColor
                font.family: Config.fonts.defaultFamily
                font.pixelSize: Config.fonts.defaultSize
            }

            MouseArea {
                id: todayMouse
                anchors.fill: parent
                hoverEnabled: true
                onClicked: root.goToday()
            }
        }
    }
}
