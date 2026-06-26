local conditions = require("heirline.conditions")

local severity = vim.diagnostic.severity

-- Cached diagnostic sign icons; static after setup, computed lazily on first
-- render so any late `vim.diagnostic.config()` overrides are picked up.
local diag_icons

local function get_diag_icons()
    if not diag_icons then
        local signs = vim.diagnostic.config().signs
        local text = type(signs) == "table" and signs.text or nil
        diag_icons = {
            [severity.INFO] = text and text[severity.INFO],
            [severity.HINT] = text and text[severity.HINT],
            [severity.WARN] = text and text[severity.WARN],
            [severity.ERROR] = text and text[severity.ERROR],
        }
    end
    return diag_icons
end

return {
    condition = conditions.has_diagnostics,
    init = function(self)
        local icons = get_diag_icons()
        self.info_icon = icons[severity.INFO]
        self.hint_icon = icons[severity.HINT]
        self.warn_icon = icons[severity.WARN]
        self.error_icon = icons[severity.ERROR]

        local counts = vim.diagnostic.count(0)
        self.info = counts[severity.INFO] or 0
        self.hints = counts[severity.HINT] or 0
        self.warnings = counts[severity.WARN] or 0
        self.errors = counts[severity.ERROR] or 0
    end,
    {
        provider = function(self)
            return self.info > 0 and (" " .. self.info_icon .. " " .. self.info)
        end,
        hl = { fg = "diag_info" },
    },
    {
        provider = function(self)
            return self.hints > 0 and (" " .. self.hint_icon .. " " .. self.hints)
        end,
        hl = { fg = "diag_hint" },
    },
    {
        provider = function(self)
            return self.warnings > 0 and (" " .. self.warn_icon .. " " .. self.warnings)
        end,
        hl = { fg = "diag_warn" },
    },
    {
        provider = function(self)
            return self.errors > 0 and (" " .. self.error_icon .. " " .. self.errors)
        end,
        hl = { fg = "diag_error" },
    },
    update = { "DiagnosticChanged", "BufEnter" },
}
