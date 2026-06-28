// codexbar.js — thin multi-provider parser for the `codexbar usage` JSON.
//
// CodexBar owns all provider/auth/API-key state; this module is a pure display
// layer that turns codexbar's `--format json` output into normalized rows for
// the bar segment + panel. It deliberately does NO provider/auth logic itself.
//
// JSON contract (verified against codexbar v0.37.2 with REAL keys):
//   - Top-level is an ARRAY of segment objects (one per provider, or one per
//     Codex account when multi-account). A bare object is tolerated too.
//   - Each segment: { provider, source, error?:{kind,message,code}, usage?:{...} }
//   - codexbar NORMALIZES quota providers (Codex, z.ai, ...) into one shape:
//       usage.primary / usage.secondary = { usedPercent, windowMinutes, resetsAt, resetDescription }
//     So Codex and z.ai share one mapper. (The docs' data.limits[]/TOKENS_LIMIT
//     describe the raw BigModel API; codexbar normalizes them away.)
//   - OpenRouter is a cost row under usage.openRouterUsage (balance /
//     totalCredits / totalUsage + usedPercent). It now renders a credits-used
//     meter, but is still never picked as "most critical".
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
    var mins = Math.round(diff / 60000);
    if (mins < 60)
        return "in " + mins + "m";
    var hours = Math.floor(mins / 60);
    var remMin = mins % 60;
    if (hours < 24)
        return remMin ? "in " + hours + "h " + remMin + "m" : "in " + hours + "h";
    var days = Math.round(hours / 24);
    return "in " + days + "d";
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
        // Secondary usage window (Codex weekly / z.ai monthly). -1/blank if none.
        secondaryPercent: -1,
        secondaryLabel: "",
        secondaryResetShort: "—",
        secondaryResetFull: "—",
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

function quotaRow(provider, account, primary, secondary, now) {
    var row = emptyRow();
    row.kind = "quota";
    row.provider = provider;
    row.account = account || "";
    row.label = providerLabel(provider) + (account ? " · " + account : "");
    row.percent = clampPercent(Number(primary && primary.usedPercent));
    row.secondaryPercent = clampPercent(Number(secondary && secondary.usedPercent));
    // Window label: prefer the minutes (codex 5h/weekly), else the provider's own
    // description (z.ai reports "5 hours window" / "Monthly" with no minutes).
    row.windowLabel = (primary && primary.windowMinutes)
        ? windowLabel(primary.windowMinutes)
        : ((primary && primary.resetDescription) || "Window");
    row.secondaryLabel = (secondary && secondary.windowMinutes)
        ? windowLabel(secondary.windowMinutes)
        : ((secondary && secondary.resetDescription) || "");
    var resetMs = parseResetTime(primary && primary.resetsAt);
    row.resetShort = relativeReset(resetMs, now);
    row.resetFull = absoluteReset(resetMs);
    var secondaryResetMs = parseResetTime(secondary && secondary.resetsAt);
    row.secondaryResetShort = relativeReset(secondaryResetMs, now);
    row.secondaryResetFull = absoluteReset(secondaryResetMs);
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

// codexbar normalizes quota providers (Codex, z.ai, ...) into one shape:
//   usage.primary / usage.secondary = { usedPercent, windowMinutes, resetsAt, resetDescription }
function mapQuota(item, provider, now) {
    var usage = item && item.usage;
    if (!usage || !usage.primary)
        return null;
    var account = usage.accountEmail
        || (usage.identity && usage.identity.accountEmail)
        || "";
    var row = quotaRow(provider, account, usage.primary, usage.secondary || {}, now);
    // Codex grants free rate-limit reset credits; surface the count when > 0.
    var credits = usage.codexResetCredits && usage.codexResetCredits.availableCount;
    if (typeof credits === "number" && credits > 0)
        row.resetCredits = credits;
    return row;
}

// OpenRouter: credits-as-dollars under usage.openRouterUsage
// (balance / totalCredits / totalUsage + usedPercent). Cost row with a
// credits-used meter; still never picked as most-critical.
function mapOpenRouter(item) {
    var u = item && item.usage && item.usage.openRouterUsage;
    if (!u)
        return null;
    var row = emptyRow();
    row.kind = "cost";
    row.provider = "openrouter";
    var account = (item.usage.identity && item.usage.identity.accountEmail) || "";
    row.account = account;
    row.label = providerLabel("openrouter") + (account ? " · " + account : "");
    var balance = Number(u.balance);
    var total = Number(u.totalCredits);
    var used = Number(u.totalUsage);
    row.percent = clampPercent(Number(u.usedPercent));
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

// parseAll(output[, now]) -> { rows:[...], mostCritical: row|null }
//
// One row per array segment. Error segments become error rows so the UI can
// show "—" / a clean message instead of crashing. mostCritical is the
// highest-percent quota row (cost/error rows are excluded); ties keep display
// order. A row whose percent couldn't be determined (percent < 0) is skipped
// for ranking purposes but still rendered.
function parseAll(output, now) {
    now = now !== undefined ? now : Date.now();
    var result = { rows: [], mostCritical: null };

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

    result.mostCritical = pickMostCritical(result.rows);
    return result;
}

function pickMostCritical(rows) {
    var best = null;
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.kind !== "quota" || r.percent < 0)
            continue;
        if (!best || r.percent > best.percent)
            best = r;
    }
    return best;
}

// parseProviders(output[, now]) -> { rows:[...], mostCritical: row|null }
//
// codexbar's `--provider all` crashes (upstream SIGILL), so the service polls
// each provider separately in one shell loop and delimits each chunk with a
// `__CBCHUNK_<provider>__` marker line. This splits on those markers, parses
// each chunk with parseAll, and merges every row into one list.
function parseProviders(output, now) {
    now = now !== undefined ? now : Date.now();
    var merged = { rows: [], mostCritical: null };
    var text = String(output || "");
    if (text.trim() === "")
        return merged;
    var chunks = text.split(/__CBCHUNK_[A-Za-z0-9_.-]+__/);
    for (var i = 0; i < chunks.length; i++) {
        var chunk = chunks[i];
        if (!chunk || !chunk.trim())
            continue;
        var parsed = parseAll(chunk, now);
        if (parsed.rows) {
            for (var j = 0; j < parsed.rows.length; j++)
                merged.rows.push(parsed.rows[j]);
        }
    }
    merged.mostCritical = pickMostCritical(merged.rows);
    return merged;
}
