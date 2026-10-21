pragma ComponentBehavior: Bound

import QtQuick
import "../../Common"

// Content of the volume popup: a slider and the device list for the output,
// then the same for the input. A click on a device makes it the default.
Column {
    id: root

    property var module
    readonly property var volume: root.module.volumeControl

    spacing: Config.popups.itemSpacing

    component SectionTitle: Text {
        color: Config.colors.base05
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize
        font.bold: true
    }

    component EmptyText: Text {
        color: Config.colors.base03
        font.family: Config.fonts.defaultFamily
        font.pixelSize: Config.fonts.defaultSize - 1
    }

    component DeviceRow: PopupListRow {
        required property var modelData
        property var defaultNode: null

        width: root.width
        current: modelData === defaultNode
        icon: current ? "●" : "○"
        label: root.volume.deviceName(modelData)
    }

    SectionTitle {
        text: "Output"
    }

    PopupSlider {
        width: root.width
        visible: !!root.volume.sink
        value: root.volume.volume
        muted: root.volume.muted
        icon: root.volume.muted ? "󰖁" : root.volume.icon
        fillColor: Config.colors.base0B
        step: Config.steps.volume
        onMoved: value => root.volume.setVolume(value)
        onIconClicked: root.volume.toggleMute()
    }

    Repeater {
        model: root.volume.sinks

        delegate: DeviceRow {
            defaultNode: root.volume.sink
            onClicked: root.volume.setDefaultSink(modelData)
        }
    }

    EmptyText {
        visible: root.volume.sinks.length === 0
        text: "No output devices"
    }

    Item {
        width: 1
        height: 4
    }

    SectionTitle {
        text: "Input"
    }

    PopupSlider {
        width: root.width
        visible: !!root.volume.source
        value: root.volume.sourceVolume
        muted: root.volume.sourceMuted
        icon: root.volume.sourceIcon
        fillColor: Config.colors.base0B
        step: Config.steps.volume
        onMoved: value => root.volume.setSourceVolume(value)
        onIconClicked: root.volume.toggleSourceMute()
    }

    Repeater {
        model: root.volume.sources

        delegate: DeviceRow {
            defaultNode: root.volume.source
            onClicked: root.volume.setDefaultSource(modelData)
        }
    }

    EmptyText {
        visible: root.volume.sources.length === 0
        text: "No input devices"
    }

    SettingsFooter {
        width: root.width
        module: root.module
    }
}
