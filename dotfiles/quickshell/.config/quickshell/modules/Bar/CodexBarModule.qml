import QtQuick

// CodexBarModule — compact bar segment showing the auto-selected most-critical
// quota source (highest window %), color-coded by band. Cost rows are never
// picked. Click toggles the detail panel. Mirrors NotificationsModule.qml.
BaseModule {
    id: root

    required property var codexBarService

    hoverEnabled: true

    readonly property var critical: codexBarService ? codexBarService.mostCriticalRow : null

    // True once codexbar has returned any real data this session (the service
    // latches it). While false the segment is hidden — mirrors BatteryModule's
    // hasBattery hiding when there is no battery.
    readonly property bool configured: codexBarService ? codexBarService.configured : false

    // nf-md-robot — distinct from the CPU module's chip icon; signals "AI usage".
    readonly property string icon: "󰚩"

    text: {
        if (!critical)
            return root.icon + " —";
        var pct = critical.percent;
        if (pct < 0 || pct === undefined || isNaN(pct))
            return root.icon;
        return root.icon + " " + Math.round(pct) + "%";
    }
    textColor: {
        if (!critical)
            return colors.fg;
        var pct = critical.percent;
        if (pct < 0 || pct === undefined || isNaN(pct))
            return colors.fg;
        if (pct >= 90)
            return colors.red;
        if (pct >= 70)
            return colors.yellow;
        return colors.fg;
    }

    onClicked: {
        if (codexBarService)
            codexBarService.togglePanel();
    }
}
