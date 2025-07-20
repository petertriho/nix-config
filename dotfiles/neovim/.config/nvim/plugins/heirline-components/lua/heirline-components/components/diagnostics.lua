local conditions = require("heirline.conditions")

return {
    condition = conditions.has_diagnostics,
    init = function(self)
        local diagnostic_signs_text = vim.diagnostic.config()["signs"]["text"]
        self.info_icon = diagnostic_signs_text[vim.diagnostic.severity.INFO]
        self.hint_icon = diagnostic_signs_text[vim.diagnostic.severity.HINT]
        self.warn_icon = diagnostic_signs_text[vim.diagnostic.severity.WARN]
        self.error_icon = diagnostic_signs_text[vim.diagnostic.severity.ERROR]

        self.info = #vim.diagnostic.get(0, { severity = vim.diagnostic.severity.INFO })
        self.hints = #vim.diagnostic.get(0, { severity = vim.diagnostic.severity.HINT })
        self.warnings = #vim.diagnostic.get(0, { severity = vim.diagnostic.severity.WARN })
        self.errors = #vim.diagnostic.get(0, { severity = vim.diagnostic.severity.ERROR })
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
