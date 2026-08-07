// codexbar.js — thin multi-provider parser for the `codexbar usage` JSON.
//
// CodexBar owns all provider/auth/API-key state; this module is a pure display
// layer that turns codexbar's `--format json` output into normalized rows for
// the bar segment + panel. It deliberately does NO provider/auth logic itself.
//
// JSON contract (verified against codexbar v0.48.0 with REAL keys):
//   - Top-level is an ARRAY of segment objects (one per provider, or one per
//     Codex account when multi-account). A bare object is tolerated too.
//   - Each segment: { provider, source, error?:{kind,message,code}, usage?:{...} }
//   - codexbar NORMALIZES quota providers (Codex, z.ai, OpenCode Go, ...) into:
//       usage.primary / usage.secondary / usage.tertiary =
//           { usedPercent, windowMinutes, resetsAt, resetDescription }
//     Any window may be null; remaining windows are compacted for display. This
//     keeps one provider-generic mapper. (The docs' data.limits[]/TOKENS_LIMIT
//     describe the raw BigModel API; codexbar normalizes them away.)
//   - OpenRouter is a cost row. codexbar 0.4x+ emits it under usage.details[]
//     (a "Credits" section with Remaining / Used / "Total added" label-value
//     rows); older 0.37.x used usage.openRouterUsage (balance / totalCredits /
//     totalUsage + usedPercent), still accepted as a fallback. Renders a
//     credits-used meter but is never picked as "most critical".
//   - Codex also carries usage.codexResetCredits.availableCount (free rate-limit
//     resets); surfaced as an info line on quota rows.
//
// Pure functions only (no QML globals). `now` is injectable for testing; it
// defaults to Date.now() so the service can call parseAll(output) directly.

.pragma library

// --- display helpers ---------------------------------------------------------

function providerLabel(id) {
    var labels = {
        codex: "Codex",
        zai: "z.ai",
        openrouter: "OpenRouter",
        openai: "OpenAI",
        claude: "Claude",
        gemini: "Gemini",
        grok: "Grok",
        cursor: "Cursor"
    };
    if (!id)
        return "Unknown";
    return labels[id] || String(id).charAt(0).toUpperCase() + String(id).slice(1);
}

// Map a percent to a color band keyword; the QML side maps band -> config color.
//   unknown (<0): neutral  · green (<70) · amber (<90) · red (>=90)
function usageBand(percent) {
    if (percent < 0 || isNaN(percent))
        return "unknown";
    if (percent >= 90)
        return "red";
    if (percent >= 70)
        return "amber";
    return "green";
}

function windowLabel(minutes) {
    minutes = Number(minutes) || 0;
    if (minutes === 300)
        return "5 hour window";
    if (minutes === 10080)
        return "Weekly window";
    if (minutes >= 1440)
        return Math.round(minutes / 1440) + " day window";
    if (minutes >= 60)
        return Math.round(minutes / 60) + " hour window";
    return minutes > 0 ? minutes + " minute window" : "Window";
}

function clampPercent(p) {
    if (p < 0 || isNaN(p))
        return -1;
    if (p > 100)
        return 100;
    return p;
}

// Parse a reset value that may be an epoch-ms number, an ISO string, or empty.
function parseResetTime(value) {
    if (value === undefined || value === null || value === "")
        return NaN;
    if (typeof value === "number")
        return value;
    var n = Number(value);
    if (!isNaN(n) && String(value).trim() !== "")
        return n;
    var ms = Date.parse(String(value));
    return ms;
}

// Humanized relative ("in 3h 20m") from a reset timestamp to `now`.
function relativeReset(resetMs, now) {
    now = now !== undefined ? now : Date.now();
    if (isNaN(resetMs))
        return "—";
    var diff = resetMs - now;
    if (diff <= 0)
        return "resets soon";
    return "in " + formatDuration(diff);
}

function formatDuration(durationMs) {
    var mins = Math.round(durationMs / 60000);
    if (mins < 60)
        return mins + "m";
    var hours = Math.floor(mins / 60);
    var remMin = mins % 60;
    if (hours < 24)
        return remMin ? hours + "h " + remMin + "m" : hours + "h";
    return Math.round(hours / 24) + "d";
}

function unavailablePace() {
    return {
        expectedPercent: -1,
        state: "",
        summary: "",
        projection: ""
    };
}

function paceForWindow(window, now) {
    var pace = unavailablePace();
    if (!window || window.usedPercent === undefined || window.usedPercent === null
            || window.usedPercent === "")
        return pace;

    var usedPercent = clampPercent(Number(window.usedPercent));
    var windowMinutes = Number(window.windowMinutes);
    var resetMs = parseResetTime(window.resetsAt);
    now = now !== undefined ? Number(now) : Date.now();
    if (!isFinite(usedPercent) || usedPercent < 0 || !isFinite(windowMinutes)
            || windowMinutes <= 0 || !isFinite(resetMs) || !isFinite(now))
        return pace;

    var durationMs = windowMinutes * 60000;
    var timeUntilResetMs = resetMs - now;
    if (!isFinite(durationMs) || durationMs <= 0 || timeUntilResetMs <= 0
            || timeUntilResetMs > durationMs)
        return pace;

    var elapsedMs = durationMs - timeUntilResetMs;
    if (elapsedMs <= 0 && usedPercent > 0)
        return pace;

    var expectedPercent = elapsedMs / durationMs * 100;
    if (expectedPercent < 3 || usedPercent >= 100)
        return pace;

    var deltaPercent = usedPercent - expectedPercent;
    pace.expectedPercent = expectedPercent;
    if (Math.abs(deltaPercent) <= 2) {
        pace.state = "onTrack";
        pace.summary = "On pace";
    } else if (deltaPercent < 0) {
        pace.state = "reserve";
        pace.summary = Math.round(Math.abs(deltaPercent)) + "% in reserve";
    } else {
        pace.state = "deficit";
        pace.summary = Math.round(deltaPercent) + "% in deficit";
    }

    if (usedPercent === 0) {
        pace.projection = "Lasts until reset";
        return pace;
    }

    var observedRate = usedPercent / elapsedMs;
    var timeToEmptyMs = (100 - usedPercent) / observedRate;
    if (!isFinite(timeToEmptyMs) || now + timeToEmptyMs >= resetMs) {
        pace.projection = "Lasts until reset";
        return pace;
    }

    var prefix = windowMinutes === 300 ? "Projected empty in " : "Runs out in ";
    pace.projection = prefix + formatDuration(timeToEmptyMs);
    return pace;
}

// Absolute short timestamp, e.g. "Jun 28 18:00".
function absoluteReset(resetMs) {
    if (isNaN(resetMs))
        return "—";
    var d = new Date(resetMs);
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    return months[d.getMonth()] + " " + d.getDate() + " "
        + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

// --- row builders ------------------------------------------------------------

function emptyRow() {
    return {
        kind: "error", // quota | cost | error
        provider: "",
        account: "",
        label: "",
        percent: -1,
        windowLabel: "",
        resetShort: "—",
        resetFull: "—",
        paceExpectedPercent: -1,
        paceState: "",
        paceSummary: "",
        paceProjection: "",
        // Additional quota windows. -1/blank if absent after compaction.
        secondaryPercent: -1,
        secondaryLabel: "",
        secondaryResetShort: "—",
        secondaryResetFull: "—",
        secondaryPaceExpectedPercent: -1,
        secondaryPaceState: "",
        secondaryPaceSummary: "",
        secondaryPaceProjection: "",
        tertiaryPercent: -1,
        tertiaryLabel: "",
        tertiaryResetShort: "—",
        tertiaryResetFull: "—",
        tertiaryPaceExpectedPercent: -1,
        tertiaryPaceState: "",
        tertiaryPaceSummary: "",
        tertiaryPaceProjection: "",
        // OpenRouter credit figures (cost rows only); blank otherwise.
        creditsBalance: "",
        creditsTotal: "",
        creditsUsed: "",
        // Codex free rate-limit reset credits available (>0 => show a line).
        resetCredits: -1,
        cost: "",
        message: ""
    };
}

function quotaRow(provider, account, primary, secondary, tertiary, now) {
    var row = emptyRow();
    row.kind = "quota";
    row.provider = provider;
    row.account = account || "";
    row.label = providerLabel(provider) + (account ? " · " + account : "");
    row.percent = clampPercent(Number(primary && primary.usedPercent));
    row.secondaryPercent = clampPercent(Number(secondary && secondary.usedPercent));
    row.tertiaryPercent = clampPercent(Number(tertiary && tertiary.usedPercent));
    // Window label: prefer the minutes (codex 5h/weekly), else the provider's own
    // description (z.ai reports "5 hours window" / "Monthly" with no minutes).
    row.windowLabel = (primary && primary.windowMinutes)
        ? windowLabel(primary.windowMinutes)
        : ((primary && primary.resetDescription) || "Window");
    row.secondaryLabel = (secondary && secondary.windowMinutes)
        ? windowLabel(secondary.windowMinutes)
        : ((secondary && secondary.resetDescription) || "");
    row.tertiaryLabel = (tertiary && tertiary.windowMinutes)
        ? windowLabel(tertiary.windowMinutes)
        : ((tertiary && tertiary.resetDescription) || "");
    var resetMs = parseResetTime(primary && primary.resetsAt);
    row.resetShort = relativeReset(resetMs, now);
    row.resetFull = absoluteReset(resetMs);
    var secondaryResetMs = parseResetTime(secondary && secondary.resetsAt);
    row.secondaryResetShort = relativeReset(secondaryResetMs, now);
    row.secondaryResetFull = absoluteReset(secondaryResetMs);
    var tertiaryResetMs = parseResetTime(tertiary && tertiary.resetsAt);
    row.tertiaryResetShort = relativeReset(tertiaryResetMs, now);
    row.tertiaryResetFull = absoluteReset(tertiaryResetMs);
    var primaryPace = paceForWindow(primary, now);
    row.paceExpectedPercent = primaryPace.expectedPercent;
    row.paceState = primaryPace.state;
    row.paceSummary = primaryPace.summary;
    row.paceProjection = primaryPace.projection;
    var secondaryPace = paceForWindow(secondary, now);
    row.secondaryPaceExpectedPercent = secondaryPace.expectedPercent;
    row.secondaryPaceState = secondaryPace.state;
    row.secondaryPaceSummary = secondaryPace.summary;
    row.secondaryPaceProjection = secondaryPace.projection;
    var tertiaryPace = paceForWindow(tertiary, now);
    row.tertiaryPaceExpectedPercent = tertiaryPace.expectedPercent;
    row.tertiaryPaceState = tertiaryPace.state;
    row.tertiaryPaceSummary = tertiaryPace.summary;
    row.tertiaryPaceProjection = tertiaryPace.projection;
    return row;
}

function costRow(provider, account, cost) {
    var row = emptyRow();
    row.kind = "cost";
    row.provider = provider;
    row.account = account || "";
    row.label = providerLabel(provider) + (account ? " · " + account : "");
    row.cost = cost;
    return row;
}

function errorRow(provider, message) {
    var row = emptyRow();
    row.kind = "error";
    row.provider = provider || "";
    row.label = providerLabel(provider);
    row.message = message || "unavailable";
    return row;
}

// --- provider-specific mappers ----------------------------------------------

// Compact all available normalized source windows into contiguous display slots
// so missing earlier windows do not leave gaps or duplicate later windows.
function mapQuota(item, provider, now) {
    var usage = item && item.usage;
    if (!usage || (!usage.primary && !usage.secondary && !usage.tertiary))
        return null;
    var windows = [];
    if (usage.primary)
        windows.push(usage.primary);
    if (usage.secondary)
        windows.push(usage.secondary);
    if (usage.tertiary)
        windows.push(usage.tertiary);
    var account = usage.accountEmail
        || (usage.identity && usage.identity.accountEmail)
        || "";
    var row = quotaRow(provider, account, windows[0] || {}, windows[1] || {}, windows[2] || {}, now);
    // Codex grants free rate-limit reset credits; surface the count when > 0.
    var credits = usage.codexResetCredits && usage.codexResetCredits.availableCount;
    if (typeof credits === "number" && credits > 0)
        row.resetCredits = credits;
    return row;
}

// Parse a money-ish string ("$190.95", "9.05", "No limit") into a number;
// NaN if blank or unparseable. Strips currency/units, keeps the digits.
function parseMoney(value) {
    if (value === undefined || value === null)
        return NaN;
    var s = String(value).replace(/[^0-9.\-]/g, "");
    if (s === "" || s === "-" || s === ".")
        return NaN;
    var n = Number(s);
    return isNaN(n) ? NaN : n;
}

// Find a usage.details[] section whose title matches (case-insensitive).
function findDetailsSection(details, title) {
    if (!Array.isArray(details))
        return null;
    var want = String(title).toLowerCase();
    for (var i = 0; i < details.length; i++) {
        var d = details[i];
        if (d && String(d.title || "").toLowerCase() === want)
            return d;
    }
    return null;
}

// First row value in a details section whose label matches any of `labels`
// (case-insensitive). "" if none.
function detailsRowValue(section, labels) {
    var rows = section && section.rows;
    if (!Array.isArray(rows))
        return "";
    var targets = Array.isArray(labels) ? labels : [labels];
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!r || typeof r !== "object")
            continue;
        var label = String(r.label || "").toLowerCase();
        for (var j = 0; j < targets.length; j++) {
            if (label === String(targets[j]).toLowerCase())
                return r.value;
        }
    }
    return "";
}

// OpenRouter: credits-as-dollars cost row. codexbar 0.4x+ ships the figures as
// label/value rows under usage.details[] ("Credits" section: Remaining / Used /
// "Total added"); older 0.37.x used usage.openRouterUsage (balance /
// totalCredits / totalUsage + usedPercent). Both shapes are accepted. Renders a
// credits-used meter but is never picked as "most critical".
function mapOpenRouter(item) {
    var usage = item && item.usage;
    if (!usage)
        return null;

    var balance = NaN, total = NaN, used = NaN, usedPercent = NaN;

    // New shape (>= 0.4x): usage.details[]. Pull the "Credits" section.
    var credits = findDetailsSection(usage.details, "Credits");
    if (credits) {
        balance = parseMoney(detailsRowValue(credits, ["Remaining", "Balance"]));
        used = parseMoney(detailsRowValue(credits, ["Used", "Usage", "Spent"]));
        total = parseMoney(detailsRowValue(credits,
            ["Total added", "Total credits", "Total"]));
    }

    // Legacy shape (0.37.x): usage.openRouterUsage. Only consulted when the new
    // shape had nothing, so a mixed/partial payload still maps.
    if (isNaN(balance) && isNaN(total) && isNaN(used)) {
        var u = usage.openRouterUsage;
        if (u) {
            balance = Number(u.balance);
            total = Number(u.totalCredits);
            used = Number(u.totalUsage);
            usedPercent = Number(u.usedPercent);
        }
    }

    // Nothing usable -> let parseAll emit a clean "no usage data" error.
    if (isNaN(balance) && isNaN(total) && isNaN(used) && isNaN(usedPercent))
        return null;

    // Derive usedPercent locally when the new shape omits it.
    if (isNaN(usedPercent)) {
        if (!isNaN(used) && !isNaN(total) && total > 0)
            usedPercent = used / total * 100;
        else if (!isNaN(balance) && !isNaN(total) && total > 0)
            usedPercent = (total - balance) / total * 100;
    }

    var row = emptyRow();
    row.kind = "cost";
    row.provider = "openrouter";
    var account = (usage.identity && usage.identity.accountEmail) || "";
    row.account = account;
    row.label = providerLabel("openrouter") + (account ? " · " + account : "");
    row.percent = clampPercent(usedPercent);
    row.creditsBalance = !isNaN(balance) ? "$" + balance.toFixed(2) : "";
    row.creditsTotal = !isNaN(total) ? "$" + total.toFixed(2) : "";
    row.creditsUsed = !isNaN(used) ? "$" + used.toFixed(2) + " used" : "";
    row.cost = !isNaN(balance) ? "Balance $" + balance.toFixed(2) : "—";
    return row;
}

function mapProvider(item, now) {
    var p = item.provider || "";
    if (p === "openrouter")
        return mapOpenRouter(item);
    if (p === "codex" || p === "zai")
        return mapQuota(item, p, now);
    // Generic fallback for any other enabled provider: try the normalized shape.
    return mapQuota(item, p, now);
}

// --- entry point -------------------------------------------------------------

// parseAll(output[, now]) -> { rows:[...], barSummary:{...} }
//
// One row per array segment. Error segments become error rows so the UI can
// show "—" / a clean message instead of crashing. barSummary counts exhausted
// quota rows and selects the highest-usage row that remains below 100%.
function parseAll(output, now) {
    now = now !== undefined ? now : Date.now();
    var result = { rows: [], barSummary: summarizeQuotaRows([]) };

    var trimmed = String(output || "").trim();
    if (trimmed === "")
        return result;

    var data;
    try {
        data = JSON.parse(trimmed);
    } catch (e) {
        result.rows.push(errorRow("", "invalid JSON from codexbar"));
        return result;
    }

    var segments = Array.isArray(data) ? data : [data];

    for (var i = 0; i < segments.length; i++) {
        var item = segments[i];
        if (!item || typeof item !== "object")
            continue;

        if (item.error) {
            result.rows.push(errorRow(item.provider, item.error.message));
            continue;
        }

        var row = mapProvider(item, now);
        if (row) {
            result.rows.push(row);
        } else {
            // Success-shaped segment we couldn't map -> degrade gracefully.
            result.rows.push(errorRow(item.provider, "no usage data"));
        }
    }

    result.barSummary = summarizeQuotaRows(result.rows);
    return result;
}

function effectiveQuotaPercent(row) {
    var best = -1;
    var values = [row.percent, row.secondaryPercent, row.tertiaryPercent];
    for (var i = 0; i < values.length; i++) {
        var value = Number(values[i]);
        if (!isNaN(value) && value >= 0 && value > best)
            best = value;
    }
    return best;
}

function summarizeQuotaRows(rows) {
    var summary = {
        exhaustedCount: 0,
        nextRow: null,
        nextPercent: -1,
        allExhausted: false
    };
    var quotaCount = 0;

    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.kind !== "quota")
            continue;
        quotaCount++;

        var percent = effectiveQuotaPercent(row);
        if (percent >= 100) {
            summary.exhaustedCount++;
            continue;
        }
        if (percent >= 0 && (!summary.nextRow || percent > summary.nextPercent)) {
            summary.nextRow = row;
            summary.nextPercent = percent;
        }
    }

    summary.allExhausted = quotaCount > 0 && summary.exhaustedCount === quotaCount;
    return summary;
}

// parseProviders(output[, now]) -> { rows:[...], barSummary:{...} }
//
// The service makes one all-providers call (`codexbar usage`) plus, when Codex
// is present, a second `--provider codex --all-accounts` call so both Codex
// accounts stay visible. The codex chunk is EMITTED FIRST, so both Codex
// accounts group at the top; the all-providers chunk follows in codexbar's own
// order (z.ai, OpenRouter, …). Each chunk is delimited by a
// `__CBCHUNK_<name>__` marker line; this splits on the markers, parses each
// chunk with parseAll, and merges — keeping the FIRST row seen for any given
// (provider, account) so the Codex primary account (which appears in both
// chunks) is not duplicated.
function parseProviders(output, now) {
    now = now !== undefined ? now : Date.now();
    var merged = { rows: [], barSummary: summarizeQuotaRows([]) };
    var text = String(output || "");
    if (text.trim() === "")
        return merged;
    var seen = {};
    var chunks = text.split(/__CBCHUNK_[A-Za-z0-9_.-]+__/);
    for (var i = 0; i < chunks.length; i++) {
        var chunk = chunks[i];
        if (!chunk || !chunk.trim())
            continue;
        var parsed = parseAll(chunk, now);
        if (parsed.rows) {
            for (var j = 0; j < parsed.rows.length; j++) {
                var row = parsed.rows[j];
                var key = row.provider + "|" + row.account;
                if (seen[key])
                    continue;
                seen[key] = true;
                merged.rows.push(row);
            }
        }
    }
    merged.barSummary = summarizeQuotaRows(merged.rows);
    return merged;
}
