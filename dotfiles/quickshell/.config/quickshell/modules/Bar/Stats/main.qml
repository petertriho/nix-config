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
    // Characters of the used memory: those of the total ("62.6" -> 4).
    readonly property int memoryDigits: Math.max(3, StatsService.totalMemory.toFixed(1).length)

    // Numbers are left-padded to their widest value, so the text keeps its
    // width in a monospace font.
    function barText(cpu: string, memory: string, gpu: string, tempIcon: string, temp: string): string {
        const parts = ["󰍛 " + cpu + "%", "󰾆 " + memory + "G"];
        if (StatsService.gpuAvailable)
            parts.push("󰢮 " + gpu + "%");
        if (StatsService.temperatureAvailable)
            parts.push(tempIcon + " " + temp + "°C");
        return parts.join(" ");
    }

    function percent(value: real): string {
        return String(Math.round(Math.max(0, Math.min(100, value)))).padStart(3, " ");
    }

    text: root.barText(root.percent(StatsService.cpuUsage), StatsService.usedMemory.toFixed(1).padStart(root.memoryDigits, " "), root.percent(StatsService.gpuUsage), root.temperatureIcon, String(Math.round(StatsService.temperature)).padStart(3, " "))
    textColor: StatsService.temperatureCritical ? Config.colors.base08 : Config.colors.base05

    // The module width is that of the widest possible text, measured with each
    // temperature icon (the icons differ in width). So it stays the same when
    // a value gains a digit, in any font.
    FontMetrics {
        id: barMetrics
        font: root.font
    }
    readonly property real widestTextWidth: {
        // Read the font, so that a font change measures again.
        if (!barMetrics.font.family)
            return 0;
        const zeros = n => "".padStart(n, "0");
        const memory = zeros(root.memoryDigits - 2) + ".0";
        let widest = 0;
        for (const icon of ["󰜗", "󱃃", "󰸁"])
            widest = Math.max(widest, barMetrics.advanceWidth(root.barText("000", memory, "000", icon, "000")));
        return widest;
    }
    implicitWidth: Math.ceil(root.widestTextWidth) + Config.module.widthPadding

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
