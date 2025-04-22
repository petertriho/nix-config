return {
    "rebelot/heirline.nvim",
    event = { "UiEnter", "VeryLazy" },
    dependencies = {
        "Zeioth/heirline-components.nvim",
    },
    config = function()
        local heirline = require("heirline")
        local conditions = require("heirline.conditions")
        local utils = require("heirline.utils")

        local hl_names = {
            "Constant",
            "DiagnosticError",
            "DiagnosticHint",
            "DiagnosticInfo",
            "DiagnosticWarn",
            "DiffDelete",
            "Folded",
            "Function",
            "NonText",
            "Special",
            "Statement",
            "String",
            "diffAdded",
            "diffChanged",
            "diffDeleted",
        }

        local hl = {}
        for _, name in ipairs(hl_names) do
            hl[name] = utils.get_highlight(name)
        end

        local colors = {
            bright_bg = hl.Folded.bg,
            bright_fg = hl.Folded.fg,
            red = hl.DiagnosticError.fg,
            dark_red = hl.DiffDelete.bg,
            green = hl.String.fg,
            blue = hl.Function.fg,
            gray = hl.NonText.fg,
            orange = hl.Constant.fg,
            purple = hl.Statement.fg,
            cyan = hl.Special.fg,
            diag_warn = hl.DiagnosticWarn.fg,
            diag_error = hl.DiagnosticError.fg,
            diag_hint = hl.DiagnosticHint.fg,
            diag_info = hl.DiagnosticInfo.fg,
            git_del = hl.diffDeleted.fg,
            git_add = hl.diffAdded.fg,
            git_change = hl.diffChanged.fg,
        }

        heirline.setup({
            opts = {
                colors = colors,
            },
        })
    end,
}
