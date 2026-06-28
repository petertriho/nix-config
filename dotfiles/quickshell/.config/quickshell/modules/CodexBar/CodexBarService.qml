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
    property bool busy: false

    property bool panelOpen: false

    function togglePanel() {
        root.panelOpen = !root.panelOpen;
        console.warn("[CBDBG] togglePanel -> " + root.panelOpen);
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
        console.warn("[CBDBG] refresh start busy=" + root.busy + " cfg=" + (codexbarConfig ? "ok" : "NULL"));
        if (root.busy)
            return;
        root.busy = true;
        var cmd = root.buildCommand();
        console.warn("[CBDBG] exec cmd=" + JSON.stringify(cmd));
        usageProc.exec({
            "command": cmd
        });
    }

    function applyParsed(parsed) {
        console.warn("[CBDBG] applyParsed rows=" + (parsed.rows ? parsed.rows.length : 0) + " mostCritical=" + (parsed.mostCritical ? parsed.mostCritical.provider : "null"));
        usageModel.clear();
        for (var i = 0; parsed.rows && i < parsed.rows.length; i++)
            usageModel.append(parsed.rows[i]);
        root.mostCriticalRow = parsed.mostCritical || null;
        root.busy = false;
    }

    // One Process, reused per tick. stdout carries JSON regardless of exit code
    // (codexbar returns exit 1 with valid JSON for unconfigured/errored providers).
    Process {
        id: usageProc
        stdout: StdioCollector {
            onStreamFinished: {
                console.warn("[CBDBG] streamFinished len=" + (this.text ? this.text.length : 0) + " head=" + JSON.stringify((this.text || "").slice(0, 80)));
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
        console.warn("[CBDBG] service onCompleted; codexbarConfig=" + (codexbarConfig ? "ok" : "NULL") + " mostCriticalRow=" + (root.mostCriticalRow ? "set" : "null"));
        root.refresh();
    }

    CodexBarPanel {
        open: root.panelOpen
        usageModel: usageModel
        mostCriticalRow: root.mostCriticalRow
        busy: root.busy
        colors: root.colors
        fontsConfig: root.fontsConfig
        onCloseRequested: root.hidePanel()
        onRefreshRequested: root.refresh()
    }
}
