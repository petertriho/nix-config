import QtQuick
import Quickshell
import ".."
import "../../Common"
import "." as Local

// CPU, memory, GPU and temperature in the bar. The values come from
// StatsService, which polls once for every bar.
BaseModule {
    id: root

    hoverHighlight: true
    popupId: "stats"

    readonly property string temperatureIcon: StatsService.temperatureCritical ? "󰸁" : StatsService.temperatureWarning ? "󱃃" : "󰜗"
    // The text has no padding, so its width follows the values. The bar fit
    // uses `fitWidth`, the width of the widest text, so a change of digits
    // does not move modules into or out of the tray overflow.
    function barText(cpu: string, memory: string, gpu: string, tempIcon: string, temp: string): string {
        const parts = ["󰍛 " + cpu + "%", "󰾆 " + memory + "G"];
        if (StatsService.gpuAvailable)
            parts.push("󰢮 " + gpu + "%");
        if (StatsService.temperatureAvailable)
            parts.push(tempIcon + " " + temp + "°C");
        return parts.join(" ");
    }

    function percent(value: real): string {
        return String(Math.round(Math.max(0, Math.min(100, value))));
    }

    text: root.barText(root.percent(StatsService.cpuUsage), StatsService.usedMemory.toFixed(1), root.percent(StatsService.gpuUsage), root.temperatureIcon, String(Math.round(StatsService.temperature)))
    textColor: StatsService.temperatureCritical ? Config.colors.base08 : Config.colors.base05

    // Measured with each temperature icon, because the icons differ in width.
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
            widest = Math.max(widest, barMetrics.advanceWidth(root.barText("100", memory, "100", icon, "100")));
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
