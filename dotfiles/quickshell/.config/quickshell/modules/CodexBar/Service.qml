pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "../Common"
import "codexbar.js" as CodexBar

// CodexBarService — polls `codexbar usage` (every enabled provider in one call)
// on a timer, plus — when Codex is among the results — a second
// `--provider codex --all-accounts` call so both Codex accounts stay visible and
// grouped. Exposes a normalized ListModel plus an exhaustion-aware summary for
// the compact bar. CodexBar owns all provider/auth/API-key state; this is a
// display layer only. The panel is the "codexbar" drawer in Popups.
Singleton {
    id: root

    // Normalized rows, one per provider/account segment (see codexbar.js).
    ListModel {
        id: usageRows
    }

    // Exhausted quota count + highest-usage source still below 100%.
    property var barSummary: null
    // Latched true the first poll that returns any real (non-error) row — i.e.
    // at least one provider has credentials and answered. The bar segment hides
    // while false (mirrors Battery hiding when upower finds no battery).
    // Latched rather than re-evaluated so a transient post-setup error doesn't
    // make the segment flicker off.
    property bool configured: false
    property bool busy: false
    // Wall-clock time of the last refresh that produced data (panel footer).
    readonly property string lastUpdated: persist.lastDataMs > 0 ? Qt.formatDateTime(new Date(persist.lastDataMs), "HH:mm") : ""

    readonly property bool panelOpen: Popups.active === "codexbar"
    readonly property int refreshIntervalMs: Math.max(10, Config.codexbar.refreshIntervalSec || 90) * 1000
    // Earliest retry of a fetch that a reload interrupted, counted from its start.
    readonly property int retryMs: 60000

    function togglePanel() {
        Popups.toggle("codexbar");
    }
    function showPanel() {
        Popups.open("codexbar");
    }
    function hidePanel() {
        if (root.panelOpen)
            Popups.close();
    }

    // Color band of a usage percent, shared by the bar segment and the panel:
    // base03 when unknown, `normal` below 70 % (default base0B), base0A below
    // 90 %, base08 from 90 %.
    function bandColor(percent, normal) {
        if (percent < 0 || isNaN(percent))
            return Config.colors.base03;
        if (percent >= 90)
            return Config.colors.base08;
        if (percent >= 70)
            return Config.colors.base0A;
        return normal === undefined ? Config.colors.base0B : normal;
    }

    function buildCommand() {
        var path = Config.codexbar.codexbarPath || "codexbar";
        // One all-providers call returns every enabled provider. If Codex is
        // among them, run a second `--all-accounts` call so both Codex accounts
        // stay visible. The codex chunk is EMITTED FIRST so Codex groups at the
        // top; the primary account appears in both chunks and is deduped by
        // parseProviders. (The all-providers call still EXECUTES first — only
        // the emission order groups Codex.)
        var script =
            "OUT1=$(" + path + " usage --format json 2>/dev/null || true)\n"
            + "if printf '%s' \"$OUT1\" | grep -qE '\"provider\"[[:space:]]*:[[:space:]]*\"codex\"'; then\n"
            + "  echo __CBCHUNK_codex__                       # emitted first -> Codex grouped at top\n"
            + "  " + path + " usage --provider codex --all-accounts --format json 2>/dev/null || true\n"
            + "fi\n"
            + "echo __CBCHUNK_all__\n"
            + "printf '%s' \"$OUT1\"";
        return ["sh", "-c", script];
    }

    function refresh() {
        if (root.busy)
            return;
        root.busy = true;
        persist.fetchStartedMs = Date.now();
        usageProc.exec({
            "command": root.buildCommand()
        });
    }

    function scheduleRefreshAt(dueMs) {
        refreshTimer.interval = Math.max(1000, dueMs - Date.now());
        refreshTimer.restart();
    }

    // Runs once per config generation, after `persist` has its values back.
    // A reload re-parses the last output and does not start new network
    // queries before the interval has passed.
    function start() {
        root.reparse();
        var now = Date.now();
        // A fetch that an earlier generation started and did not finish lost
        // its output. Retry it, but at most once a minute during reload bursts.
        if (persist.fetchStartedMs > persist.lastFetchMs && now - persist.fetchStartedMs < root.retryMs)
            root.scheduleRefreshAt(persist.fetchStartedMs + root.retryMs);
        else if (persist.lastFetchMs > 0 && now >= persist.lastFetchMs && now - persist.lastFetchMs < root.refreshIntervalMs)
            root.scheduleRefreshAt(persist.lastFetchMs + root.refreshIntervalMs);
        else
            root.refresh();
    }

    function reparse() {
        if (persist.lastOutput !== "")
            root.applyOutput(persist.lastOutput);
    }

    function applyOutput(output) {
        var parsed = CodexBar.parseProviders(output);
        var rows = parsed.rows || [];
        // Update the rows in place, so the panel keeps its delegates.
        for (var i = 0; i < rows.length; i++) {
            if (i < usageRows.count)
                usageRows.set(i, rows[i]);
            else
                usageRows.append(rows[i]);
        }
        if (usageRows.count > rows.length)
            usageRows.remove(rows.length, usageRows.count - rows.length);
        root.barSummary = parsed.barSummary || null;
        // Latch configured on the first real row (see property comment above).
        if (!root.configured) {
            for (var j = 0; j < rows.length; j++) {
                if (rows[j].kind !== "error") {
                    root.configured = true;
                    break;
                }
            }
        }
        return rows.length;
    }

    // Survives config reloads (see start()).
    PersistentProperties {
        id: persist
        reloadableId: "codexbarService"

        // Raw stdout of the last fetch. Relative reset times and pace come
        // from it and the current time, so a re-parse keeps them current.
        property string lastOutput: ""
        property real fetchStartedMs: 0
        property real lastFetchMs: 0
        property real lastDataMs: 0

        onLoaded: root.start()
    }

    // One Process, reused per tick. stdout carries JSON regardless of exit code
    // (codexbar returns exit 1 with valid JSON for unconfigured/errored providers).
    Process {
        id: usageProc
        stdout: StdioCollector {
            onStreamFinished: {
                var now = Date.now();
                persist.lastOutput = this.text;
                persist.lastFetchMs = now;
                if (root.applyOutput(this.text) > 0)
                    persist.lastDataMs = now;
                root.busy = false;
                root.scheduleRefreshAt(now + root.refreshIntervalMs);
            }
        }
    }

    Timer {
        id: refreshTimer
        onTriggered: root.refresh()
    }

    // Re-parse each minute while the panel is open (no new CLI call), and
    // once when it opens.
    Timer {
        interval: 60000
        repeat: true
        running: root.panelOpen
        triggeredOnStart: true
        onTriggered: root.reparse()
    }

    DeferredLoader {
        open: root.panelOpen

        Panel {
            open: root.panelOpen
            usageModel: usageRows
            busy: root.busy
            lastUpdated: root.lastUpdated
            refreshIntervalSec: Config.codexbar.refreshIntervalSec
            onCloseRequested: root.hidePanel()
            onRefreshRequested: root.refresh()
        }
    }
}
