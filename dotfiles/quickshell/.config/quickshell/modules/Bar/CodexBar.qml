import QtQuick
import "../Common"
import "../CodexBar"

// CodexBar — compact quota summary. Exhausted provider/account rows stay
// visible as a red count while the highest remaining usage is shown beside it.
// Cost/error rows are excluded. Click toggles the detail panel.
BaseModule {
    id: root

    hoverEnabled: true
    hoverHighlight: true

    readonly property var summary: CodexBarService.barSummary

    // True once codexbar has returned any real data this session (the service
    // latches it). While false the segment is hidden — mirrors Battery's
    // hasBattery hiding when there is no battery.
    readonly property bool configured: CodexBarService.configured
    available: root.configured

    // nf-md-robot — distinct from the CPU module's chip icon; signals "AI usage".
    readonly property string icon: "󰚩"
    // nf-md-close-circle — compact marker for an exhausted quota source.
    readonly property string exhaustedIcon: "󰅖"

    function colored(value, color) {
        return "<font color=\"" + color + "\">" + value + "</font>";
    }

    function displayPercent(percent) {
        return Math.min(99, Math.round(percent)) + "%";
    }

    textFormat: Text.StyledText
    text: {
        if (!root.summary)
            return root.icon + " —";

        var exhausted = root.summary.exhaustedCount || 0;
        var nextPercent = root.summary.nextPercent;
        var prefix = root.icon;
        if (exhausted > 0)
            prefix += " " + root.colored(root.exhaustedIcon + exhausted, Config.colors.base08) + " ·";

        if (nextPercent >= 0 && !isNaN(nextPercent))
            return prefix + " " + root.colored(root.displayPercent(nextPercent), CodexBarService.bandColor(nextPercent, Config.colors.base05));
        if (exhausted > 0 && root.summary.allExhausted)
            return prefix + " " + root.colored("FULL", Config.colors.base08);
        return prefix + " —";
    }
    textColor: Config.colors.base05

    managesPopups: true

    onClicked: CodexBarService.togglePanel()
}
