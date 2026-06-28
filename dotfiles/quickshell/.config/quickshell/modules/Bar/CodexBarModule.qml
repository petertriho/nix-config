import QtQuick

// CodexBarModule — compact bar segment showing the auto-selected most-critical
// quota source (highest window %), color-coded by band. Cost rows are never
// picked. Click toggles the detail panel. Mirrors NotificationsModule.qml.
BaseModule {
    id: root

    required property var codexBarService

    hoverEnabled: true

    readonly property var critical: codexBarService ? codexBarService.mostCriticalRow : null

    Component.onCompleted: console.warn("[CBDBG] module ready service=" + (codexBarService ? "ok" : "NULL") + " mc=" + (codexBarService && codexBarService.mostCriticalRow ? codexBarService.mostCriticalRow.provider : "null"))
    onCriticalChanged: console.warn("[CBDBG] critical -> " + (critical ? (critical.provider + "@" + critical.percent) : "null"))

    text: {
        if (!critical)
            return "󰚥 —";
        var pct = critical.percent;
        if (pct < 0 || pct === undefined || isNaN(pct))
            return "󰚥";
        return "󰚥 " + Math.round(pct) + "%";
    }
    textColor: codexBarService ? codexBarService.bandColor(critical ? critical.percent : -1) : colors.fg

    onClicked: {
        console.warn("[CBDBG] module click service=" + (codexBarService ? "ok" : "NULL"));
        if (codexBarService)
            codexBarService.togglePanel();
    }
}
