local conditions = require("heirline.conditions")

return {
    condition = conditions.has_diagnostics,
    init = function(self)
        local diagnostic_signs_text = vim.diagnostic.config()["signs"]["text"]
        self.info_icon = diagnostic_signs_text[vim.diagnostic.severity.INFO]
        self.hint_icon = diagnostic_signs_text[vim.diagnostic.severity.HINT]
        self.warn_icon = diagnostic_signs_text[vim.diagnostic.severity.WARN]
        self.error_icon = diagnostic_signs_text[vim.diagnostic.severity.ERROR]

        local counts = vim.diagnostic.count(0)
        self.info = counts[vim.diagnostic.severity.INFO] or 0
        self.hints = counts[vim.diagnostic.severity.HINT] or 0
        self.warnings = counts[vim.diagnostic.severity.WARN] or 0
        self.errors = counts[vim.diagnostic.severity.ERROR] or 0
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
