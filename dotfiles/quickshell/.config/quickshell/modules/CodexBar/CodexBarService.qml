import QtQuick
import Quickshell.Io
import "codexbar.js" as CodexBar

// CodexBarService — polls `codexbar usage --provider all --format json` on a
// timer and exposes a normalized ListModel + mostCriticalRow for the bar
// segment + panel. CodexBar owns all provider/auth/API-key state; this is a
// display layer only.
Item {
    id: root

    required property QtObject colors
    required property QtObject fontsConfig
    required property QtObject codexbarConfig

    // Normalized rows, one per provider/account segment (see codexbar.js).
    ListModel {
        id: usageModel
    }

    // Highest-percent quota row (cost/error excluded); null until we have data.
    property var mostCriticalRow: null
    // Latched true the first poll that returns any real (non-error) row — i.e.
    // at least one provider has credentials and answered. The bar segment hides
    // while false (mirrors BatteryModule hiding when upower finds no battery).
    // Latched rather than re-evaluated so a transient post-setup error doesn't
    // make the segment flicker off.
    property bool configured: false
    property bool busy: false
    // Wall-clock time of the last refresh that produced data (panel footer).
    property string lastUpdated: ""

    property bool panelOpen: false

    function togglePanel() {
        root.panelOpen = !root.panelOpen;
    }
    function showPanel() {
        root.panelOpen = true;
    }
    function hidePanel() {
        root.panelOpen = false;
    }

    // Map a percent to a config color band (shared by the bar segment + panel).
    function bandColor(percent) {
        if (percent < 0 || isNaN(percent))
            return colors.comment;
        if (percent >= 90)
            return colors.red;
        if (percent >= 70)
            return colors.yellow;
        return colors.green;
    }

    function buildCommand() {
        var path = (codexbarConfig && codexbarConfig.codexbarPath) || "codexbar";
        var providers = (codexbarConfig && codexbarConfig.providers) || ["codex", "zai", "openrouter"];
        var zaiUrl = (codexbarConfig && codexbarConfig.zAiQuotaUrl) || "";
        // codexbar's `--provider all` crashes (upstream SIGILL), so poll each
        // provider separately in one shell loop, delimiting chunks for parseProviders.
        var lines = [];
        for (var i = 0; i < providers.length; i++) {
            var p = providers[i];
            var extra = p === "codex" ? " --all-accounts" : "";
            var prefix = p === "zai" && zaiUrl.length > 0 ? "Z_AI_QUOTA_URL=" + zaiUrl + " " : "";
            lines.push("echo __CBCHUNK_" + p + "__; "
                + prefix + path + " usage --provider " + p + extra + " --format json 2>/dev/null || true");
        }
        return ["sh", "-c", lines.join("; ")];
    }

    function refresh() {
        if (root.busy)
            return;
        root.busy = true;
        usageProc.exec({
            "command": root.buildCommand()
        });
    }

    function applyParsed(parsed) {
        usageModel.clear();
        for (var i = 0; parsed.rows && i < parsed.rows.length; i++)
            usageModel.append(parsed.rows[i]);
        root.mostCriticalRow = parsed.mostCritical || null;
        // Latch configured on the first real row (see property comment above).
        if (!root.configured && parsed.rows) {
            for (var j = 0; j < parsed.rows.length; j++) {
                if (parsed.rows[j].kind !== "error") {
                    root.configured = true;
                    break;
                }
            }
        }
        if (parsed.rows && parsed.rows.length > 0)
            root.lastUpdated = Qt.formatDateTime(new Date(), "HH:mm");
        root.busy = false;
    }

    // One Process, reused per tick. stdout carries JSON regardless of exit code
    // (codexbar returns exit 1 with valid JSON for unconfigured/errored providers).
    Process {
        id: usageProc
        stdout: StdioCollector {
            onStreamFinished: {
                root.applyParsed(CodexBar.parseProviders(this.text));
            }
        }
    }

    Timer {
        id: refreshTimer
        interval: Math.max(10, (codexbarConfig && codexbarConfig.refreshIntervalSec) || 90) * 1000
        repeat: true
        running: true
        onTriggered: root.refresh()
    }

    Component.onCompleted: {
        root.refresh();
    }

    CodexBarPanel {
        open: root.panelOpen
        usageModel: usageModel
        mostCriticalRow: root.mostCriticalRow
        busy: root.busy
        lastUpdated: root.lastUpdated
        refreshIntervalSec: codexbarConfig.refreshIntervalSec
        colors: root.colors
        fontsConfig: root.fontsConfig
        onCloseRequested: root.hidePanel()
        onRefreshRequested: root.refresh()
    }
}
