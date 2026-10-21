import QtQuick
import Quickshell
import ".."
import "../../Common"
import "." as Local

// CPU, memory, GPU and temperature in the bar. The values come from
// StatsService, which polls once for every bar. Each metric takes its own
// warning or critical color.
BaseModule {
    id: root

    hoverHighlight: true
    popupId: "stats"

    readonly property string temperatureIcon: StatsService.temperatureCritical ? "󰸁" : StatsService.temperatureWarning ? "󱃃" : "󰜗"
    // Color of each metric, by the `key` of its part.
    readonly property var levelColors: ({
            "cpu": StatsService.levelColor(StatsService.cpuUsage, Config.thresholds.usage, Config.colors.base05),
            "memory": StatsService.levelColor(StatsService.memoryUsage, Config.thresholds.usage, Config.colors.base05),
            "gpu": StatsService.levelColor(StatsService.gpuUsage, Config.thresholds.usage, Config.colors.base05),
            "temperature": StatsService.levelColor(StatsService.temperature, Config.thresholds.temperature, Config.colors.base05)
        })

    // The text of each metric. It has no padding, so its width follows the
    // values. The bar fit uses `fitWidth`, the width of the widest text, so a
    // change of digits does not move modules into or out of the tray overflow.
    function barParts(cpu: string, memory: string, gpu: string, tempIcon: string, temp: string): var {
        const parts = [
            {
                key: "cpu",
                text: "󰍛 " + cpu + "%"
            },
            {
                key: "memory",
                text: "󰾆 " + memory + "G"
            }
        ];
        if (StatsService.gpuAvailable)
            parts.push({
                key: "gpu",
                text: "󰢮 " + gpu + "%"
            });
        if (StatsService.temperatureAvailable)
            parts.push({
                key: "temperature",
                text: tempIcon + " " + temp + "°C"
            });
        return parts;
    }

    function percent(value: real): string {
        return String(Math.round(Math.max(0, Math.min(100, value))));
    }

    // Every part has a color tag, so the tray overflow row, which shows this
    // text as AutoText, detects it as rich text too.
    textFormat: Text.StyledText
    text: root.barParts(root.percent(StatsService.cpuUsage), StatsService.usedMemory.toFixed(1), root.percent(StatsService.gpuUsage), root.temperatureIcon, String(Math.round(StatsService.temperature))).map(part => "<font color=\"" + root.levelColors[part.key] + "\">" + part.text + "</font>").join(" ")

    // Measured with each temperature icon, because the icons differ in width.
    // The color tags take no width.
    FontMetrics {
        id: barMetrics
        font: root.font
    }
    readonly property real fitWidth: {
        // Read the font, so that a font change measures again.
        if (!barMetrics.font.family)
            return 0;
        // The used memory has at most the digits of the total ("62.6").
        const memory = "".padStart(Math.max(3, StatsService.totalMemory.toFixed(1).length) - 2, "0") + ".0";
        let widest = 0;
        for (const icon of ["󰜗", "󱃃", "󰸁"])
            widest = Math.max(widest, barMetrics.advanceWidth(root.barParts("100", memory, "100", icon, "100").map(part => part.text).join(" ")));
        return Math.ceil(widest) + Config.module.widthPadding;
    }

    BarPopup {
        module: root
        preferredWidth: 440

        Local.Popup {}
    }

    onRightClicked: {
        Quickshell.execDetached({
            command: ["ghostty", "-e", "btop"]
        });
    }
}
