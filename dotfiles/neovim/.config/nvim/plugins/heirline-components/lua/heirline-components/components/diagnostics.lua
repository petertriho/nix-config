local escape = require("heirline-components.utils.statusline").escape

local severity = vim.diagnostic.severity

local fallback_icons = {
    [severity.ERROR] = "E",
    [severity.WARN] = "W",
    [severity.INFO] = "I",
    [severity.HINT] = "H",
}

-- Cached diagnostic sign icons; static after setup, computed lazily on first
-- render so any late `vim.diagnostic.config()` overrides are picked up.
local diag_icons

local function get_diag_icons()
    if not diag_icons then
        local signs = vim.diagnostic.config().signs
        local text = type(signs) == "table" and signs.text or {}
        diag_icons = {}
        for level, fallback in pairs(fallback_icons) do
            diag_icons[level] = escape(text[level] or fallback)
        end
    end
    return diag_icons
end

local function DiagnosticCount(level, color)
    return {
        condition = function(self)
            return (self.counts[level] or 0) > 0
        end,
        provider = function(self)
            return " " .. self.icons[level] .. " " .. self.counts[level]
        end,
        hl = { fg = color },
    }
end

-- Not cached and no `conditions.has_diagnostics`: that condition copies every diagnostic of the
-- buffer on each render, and heirline caches by window number, which goes stale when windows are
-- renumbered. `vim.diagnostic.count()` takes about 13 µs for 1,000 diagnostics.
return {
    init = function(self)
        self.icons = get_diag_icons()
        self.counts = vim.diagnostic.count(0)
    end,
    DiagnosticCount(severity.ERROR, "diag_error"),
    DiagnosticCount(severity.WARN, "diag_warn"),
    DiagnosticCount(severity.INFO, "diag_info"),
    DiagnosticCount(severity.HINT, "diag_hint"),
}
