import QtQuick

// CodexBar — compact quota summary. Exhausted provider/account rows stay
// visible as a red count while the highest remaining usage is shown beside it.
// Cost/error rows are excluded. Click toggles the detail panel.
BaseModule {
    id: root

    required property var codexBarService

    hoverEnabled: true
    hoverHighlight: true

    readonly property var summary: codexBarService ? codexBarService.barSummary : null

    // True once codexbar has returned any real data this session (the service
    // latches it). While false the segment is hidden — mirrors Battery's
    // hasBattery hiding when there is no battery.
    readonly property bool configured: codexBarService ? codexBarService.configured : false

    // nf-md-robot — distinct from the CPU module's chip icon; signals "AI usage".
    readonly property string icon: "󰚩"
    // nf-md-close-circle — compact marker for an exhausted quota source.
    readonly property string exhaustedIcon: "󰅖"

    function colored(value, color) {
        return "<font color=\"" + color + "\">" + value + "</font>";
    }

    function usageColor(percent) {
        if (percent >= 90)
            return colors.base08;
        if (percent >= 70)
            return colors.base0A;
        return colors.base05;
    }

    function displayPercent(percent) {
        return Math.min(99, Math.round(percent)) + "%";
    }

    textFormat: Text.StyledText
    text: {
        if (!summary)
            return root.icon + " —";

        var exhausted = summary.exhaustedCount || 0;
        var nextPercent = summary.nextPercent;
        var prefix = root.icon;
        if (exhausted > 0)
            prefix += " " + root.colored(root.exhaustedIcon + exhausted, colors.base08) + " ·";

        if (nextPercent >= 0 && !isNaN(nextPercent))
            return prefix + " " + root.colored(root.displayPercent(nextPercent), root.usageColor(nextPercent));
        if (exhausted > 0 && summary.allExhausted)
            return prefix + " " + root.colored("FULL", colors.base08);
        return prefix + " —";
    }
    textColor: colors.base05

    onClicked: {
        if (codexBarService)
            codexBarService.togglePanel();
    }
}
