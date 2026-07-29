import QtQuick
import "../../Common"

OverlayHost {
    id: calendarPopup

    property var module
    property var barWindow
    property QtObject colors
    property QtObject fontsConfig
    property QtObject popupsConfig
    property QtObject overlayConfig
    animationDurationMs: overlayConfig ? overlayConfig.animationDurationMs : 180
    closeGraceMs: overlayConfig ? overlayConfig.closeGraceMs : 220
    screen: barWindow ? barWindow.screen : null
    open: module && module.showPopup
    onCloseRequested: if (module)
        module.showPopup = false

    Rectangle {
        id: calendarBg
        readonly property int popupPadding: popupsConfig ? popupsConfig.padding : 16
        readonly property int popupMargin: popupsConfig ? popupsConfig.margin : 8
        readonly property real preferredHeight: calendarCol.implicitHeight + popupMargin
        readonly property real availableHeight: Math.max(1, (parent ? parent.height : preferredHeight) - y - popupMargin)

        width: __gridWidth + popupPadding
        height: Math.min(preferredHeight, availableHeight)
        x: module ? module.popupX(width) : 0
        y: (barWindow ? barWindow.height : 0) + 4
        color: colors.base01
        border.color: colors.base10
        radius: popupsConfig.cornerRadius
        opacity: calendarPopup.open ? 1.0 : 0.0
        scale: calendarPopup.open ? 1.0 : 0.98
        transformOrigin: Item.Top

        Behavior on opacity {
            NumberAnimation {
                duration: calendarPopup.animationDurationMs
            }
        }
        Behavior on scale {
            NumberAnimation {
                duration: calendarPopup.animationDurationMs
            }
        }

        // Single hover-only overlay on top of the whole popup.
        // acceptedButtons: NoButton lets clicks fall through to the
        // buttons/cells beneath while this surface reliably tracks
        // enter/leave (no nested-MouseArea hover thrashing).
        // onPositionChanged resolves the hovered cell + button flags ONCE
        // per move; children bind to those cheaply instead of each doing
        // their own coordinate transform.
        MouseArea {
            id: calHover
            anchors.fill: parent
            hoverEnabled: true
            acceptedButtons: Qt.NoButton
            z: 1000
            onExited: {
                calendarBg.hoveredCellIndex = -1;
                calendarBg.prevHovered = false;
                calendarBg.nextHovered = false;
                calendarBg.todayHovered = false;
            }
            onPositionChanged: function (mouse) {
                var mx = mouse.x;
                var my = mouse.y;
                calendarBg.prevHovered = calendarBg.__contains(prevBtn, mx, my);
                calendarBg.nextHovered = calendarBg.__contains(nextBtn, mx, my);
                calendarBg.todayHovered = calendarBg.__contains(todayBtn, mx, my);
                var o = dayGrid.mapToItem(calendarBg, 0, 0);
                var relX = mx - o.x;
                var relY = my - o.y;
                var pitch = calendarBg.__gridPitch;
                var cs = calendarBg.__cellSize;
                if (relX < 0 || relY < 0 || relX >= dayGrid.width || relY >= dayGrid.height) {
                    calendarBg.hoveredCellIndex = -1;
                    return;
                }
                var col = Math.floor(relX / pitch);
                var row = Math.floor(relY / pitch);
                var cx = col * pitch;
                var cy = row * pitch;
                if (col >= 0 && col < 7 && row >= 0 && row < 6 && relX < cx + cs && relY < cy + cs)
                    calendarBg.hoveredCellIndex = row * 7 + col;
                else
                    calendarBg.hoveredCellIndex = -1;
            }
        }

        readonly property int __cellSize: fontsConfig.defaultSize + 22
        readonly property int __gridGap: 2
        readonly property int __gridPitch: __cellSize + __gridGap
        readonly property int __gridWidth: __cellSize * 7 + __gridGap * 6

        // Hover state, resolved once per move by calHover above.
        property int hoveredCellIndex: -1
        property bool prevHovered: false
        property bool nextHovered: false
        property bool todayHovered: false

        // Bounds check of a calendarBg-space point against an item.
        function __contains(item, mx, my) {
            var o = item.mapToItem(calendarBg, 0, 0);
            return mx >= o.x && my >= o.y && mx < o.x + item.width && my < o.y + item.height;
        }

        Flickable {
            id: calendarFlick
            x: calendarBg.popupPadding / 2
            y: calendarBg.popupMargin / 2
            width: Math.max(1, parent.width - calendarBg.popupPadding)
            height: Math.max(1, parent.height - calendarBg.popupMargin)
            clip: true
            contentWidth: width
            contentHeight: calendarCol.implicitHeight
            boundsBehavior: Flickable.StopAtBounds
            interactive: contentHeight > height

            Column {
                id: calendarCol
                width: calendarFlick.width
                spacing: popupsConfig.itemSpacing

                // Header: prev | month label | next
                Row {
                    id: headerRow
                    width: calendarBg.__gridWidth
                    spacing: popupsConfig.itemSpacing

                    Rectangle {
                        id: prevBtn
                        width: calendarBg.__cellSize
                        height: calendarBg.__cellSize
                        color: calendarBg.prevHovered ? colors.base02 : "transparent"
                        radius: 4
                        Text {
                            anchors.centerIn: parent
                            text: "‹"
                            color: colors.base05
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize + 2
                        }
                        MouseArea {
                            id: prevMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: module.goPrevMonth()
                        }
                    }

                    Text {
                        width: Math.max(1, calendarBg.__gridWidth - calendarBg.__cellSize * 2 - headerRow.spacing * 2)
                        height: calendarBg.__cellSize
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        text: module.monthLabel
                        color: colors.base05
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize
                        font.bold: true
                        MouseArea {
                            anchors.fill: parent
                            onDoubleClicked: module.goToday()
                        }
                    }

                    Rectangle {
                        id: nextBtn
                        width: calendarBg.__cellSize
                        height: calendarBg.__cellSize
                        color: calendarBg.nextHovered ? colors.base02 : "transparent"
                        radius: 4
                        Text {
                            anchors.centerIn: parent
                            text: "›"
                            color: colors.base05
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize + 2
                        }
                        MouseArea {
                            id: nextMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            onClicked: module.goNextMonth()
                        }
                    }
                }

                // Weekday header
                Row {
                    width: calendarBg.__gridWidth
                    spacing: calendarBg.__gridGap
                    Repeater {
                        model: module.weekdayLabels
                        delegate: Text {
                            width: calendarBg.__cellSize
                            height: calendarBg.__cellSize * 0.7
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                            text: modelData
                            color: colors.base04
                            font.family: fontsConfig.defaultFamily
                            font.pixelSize: fontsConfig.defaultSize - 1
                        }
                    }
                }

                // Day grid (6 weeks x 7 days). Grid gives a uniform pitch so
                // the overlay can resolve the hovered cell from coordinates.
                Grid {
                    id: dayGrid
                    columns: 7
                    spacing: calendarBg.__gridGap
                    width: calendarBg.__gridWidth

                    Repeater {
                        model: 42
                        delegate: Rectangle {
                            id: dayCell
                            width: calendarBg.__cellSize
                            height: calendarBg.__cellSize
                            radius: 4
                            readonly property var cell: module.cellModel[index]
                            color: {
                                if (!cell)
                                    return "transparent";
                                if (cell.isToday)
                                    return colors.base0D;
                                if (index === calendarBg.hoveredCellIndex)
                                    return colors.base02;
                                return "transparent";
                            }

                            Text {
                                anchors.centerIn: parent
                                text: cell ? cell.day : ""
                                color: {
                                    if (!cell)
                                        return colors.base05;
                                    if (cell.isToday)
                                        return colors.base01;
                                    return cell.inMonth ? colors.base05 : colors.base04;
                                }
                                font.family: fontsConfig.defaultFamily
                                font.pixelSize: fontsConfig.defaultSize
                                font.bold: cell && cell.isToday
                            }

                            MouseArea {
                                id: dayMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                onDoubleClicked: {
                                    if (cell && cell.isToday)
                                        module.goToday();
                                }
                            }
                        }
                    }
                }

                // Today button
                Rectangle {
                    id: todayBtn
                    width: calendarBg.__gridWidth
                    height: todayText.implicitHeight + 8
                    color: calendarBg.todayHovered ? colors.base02 : "transparent"
                    radius: 4
                    Text {
                        id: todayText
                        anchors.centerIn: parent
                        text: "Today"
                        color: colors.base0D
                        font.family: fontsConfig.defaultFamily
                        font.pixelSize: fontsConfig.defaultSize
                    }
                    MouseArea {
                        id: todayMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        onClicked: module.goToday()
                    }
                }
            }
        }
    }
}
