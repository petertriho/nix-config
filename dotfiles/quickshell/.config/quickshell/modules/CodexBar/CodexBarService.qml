import QtQuick
import Quickshell.Io
import "codexbar.js" as CodexBar

// CodexBarService — polls `codexbar usage` (every enabled provider in one call)
// on a timer, plus — when Codex is among the results — a second
// `--provider codex --all-accounts` call so both Codex accounts stay visible and
// grouped. Exposes a normalized ListModel + mostCriticalRow for the bar segment
// + panel. CodexBar owns all provider/auth/API-key state; this is a display
// layer only.
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
        // One all-providers call returns every enabled provider. If Codex is
        // among them, run a second `--all-accounts` call so both Codex accounts
        // stay visible. The codex chunk is EMITTED FIRST so Codex groups at the
        // top; the primary account appears in both chunks and is deduped by
        // parseProviders. (The all-providers call still EXECUTES first — only
        // the emission order groups Codex.)
        var script =
            "OUT1=$(" + path + " usage --format json --pretty 2>/dev/null || true)\n"
            + "if printf '%s' \"$OUT1\" | grep -qE '\"provider\"[[:space:]]*:[[:space:]]*\"codex\"'; then\n"
            + "  echo __CBCHUNK_codex__                       # emitted first -> Codex grouped at top\n"
            + "  " + path + " usage --provider codex --all-accounts --format json --pretty 2>/dev/null || true\n"
            + "fi\n"
            + "echo __CBCHUNK_all__\n"
            + "printf '%s' \"$OUT1\"";
        return ["sh", "-c", script];
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
