import QtQuick
import "../Common"

BaseModule {
    id: root

    property string title: ""

    text: root.title
    textColor: Config.colors.base04
    visible: root.title.length > 0 && root.width > Config.module.widthPadding
    clip: true
    horizontalAlignment: Text.AlignLeft
    elide: Text.ElideRight
}
