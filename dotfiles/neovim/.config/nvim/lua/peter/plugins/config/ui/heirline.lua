return {
    "rebelot/heirline.nvim",
    event = { "UiEnter", "VeryLazy" },
    dependencies = {
        "Zeioth/heirline-components.nvim",
    },
    init = function()
        vim.opt.laststatus = 3
    end,
    config = function()
        local heirline = require("heirline")
        local conditions = require("heirline.conditions")
        local utils = require("heirline.utils")

        local hl_names = {
            "Constant",
            "CursorLine",
            "DiagnosticError",
            "DiagnosticHint",
            "DiagnosticInfo",
            "DiagnosticWarn",
            "DiffDelete",
            "Directory",
            "Folded",
            "Function",
            "NonText",
            "Special",
            "Statement",
            "String",
            "Todo",
            "diffAdded",
            "diffChanged",
            "diffDeleted",
        }

        local hl = {}
        for _, name in ipairs(hl_names) do
            hl[name] = utils.get_highlight(name)
        end

        local colors = {
            bg_bright = hl.Folded.bg,
            fg_bright = hl.Folded.fg,
            bg_highlight = hl.CursorLine.bg,
            red = hl.DiagnosticError.fg,
            dark_red = hl.DiffDelete.bg,
            green = hl.String.fg,
            blue = hl.Function.fg,
            gray = hl.NonText.fg,
            orange = hl.Constant.fg,
            purple = hl.Statement.fg,
            cyan = hl.Special.fg,
            yellow = hl.Todo.bg,
            diag_warn = hl.DiagnosticWarn.fg,
            diag_error = hl.DiagnosticError.fg,
            diag_hint = hl.DiagnosticHint.fg,
            diag_info = hl.DiagnosticInfo.fg,
            git_del = hl.diffDeleted.fg,
            git_add = hl.diffAdded.fg,
            git_change = hl.diffChanged.fg,
            directory = hl.Directory.fg,
        }

        local Block = {
            provider = " ",
        }

        local ViMode = {
            init = function(self)
                self.mode = vim.fn.mode(1)
            end,
            static = {
                mode_names = {
                    n = "NORMAL",
                    no = "OP PENDING",
                    nov = "NO VISUAL",
                    noV = "NO VISUAL LINE",
                    ["no\22"] = "NO VISUAL BLOCK",
                    niI = "NORMAL INSERT",
                    niR = "NORMAL REPLACE",
                    niV = "NORMAL VISUAL",
                    nt = "NORMAL TERMINAL",
                    v = "VISUAL",
                    vs = "VISUAL SELECT",
                    V = "VISUAL LINE",
                    Vs = "VISUAL LINE SELECT",
                    ["\22"] = "VISUAL BLOCK",
                    ["\22s"] = "VISUAL BLOCK SELECT",
                    s = "SELECT",
                    S = "SELECT LINE",
                    ["\19"] = "SELECT BLOCK",
                    i = "INSERT",
                    ic = "INSERT COMPLETION",
                    ix = "INSERT COMPLETION",
                    R = "REPLACE",
                    Rc = "REPLACE COMPLETION",
                    Rx = "REPLACE COMPLETION",
                    Rv = "REPLACE VISUAL",
                    Rvc = "REPLACE VISUAL COMPLETION",
                    Rvx = "REPLACE VISUAL COMPLETION",
                    c = "COMMAND",
                    cv = "EX COMMAND",
                    r = "PROMPT",
                    rm = "MORE",
                    ["r?"] = "CONFIRM",
                    ["!"] = "SHELL",
                    t = "TERMINAL",
                },
                short_mode_names = {
                    n = "N",
                    no = "N?",
                    nov = "N?",
                    noV = "N?",
                    ["no\22"] = "N?",
                    niI = "Ni",
                    niR = "Nr",
                    niV = "Nv",
                    nt = "Nt",
                    v = "V",
                    vs = "Vs",
                    V = "V_",
                    Vs = "Vs",
                    ["\22"] = "^V",
                    ["\22s"] = "^V",
                    s = "S",
                    S = "S_",
                    ["\19"] = "^S",
                    i = "I",
                    ic = "Ic",
                    ix = "Ix",
                    R = "R",
                    Rc = "Rc",
                    Rx = "Rx",
                    Rv = "Rv",
                    Rvc = "Rv",
                    Rvx = "Rv",
                    c = "C",
                    cv = "Ex",
                    r = "...",
                    rm = "M",
                    ["r?"] = "?",
                    ["!"] = "!",
                    t = "T",
                },
                mode_colors = {
                    n = "blue",
                    i = "green",
                    v = "purple",
                    V = "purple",
                    ["\22"] = "purple",
                    c = "yellow",
                    s = "purple",
                    S = "purple",
                    ["\19"] = "purple",
                    R = "red",
                    r = "red",
                    ["!"] = "blue",
                    t = "blue",
                },
            },
            provider = function(self)
                return " " .. self.mode_names[self.mode] .. " "
            end,
            hl = function(self)
                local mode = self.mode:sub(1, 1)
                return { fg = "bg", bg = self.mode_colors[mode], bold = true }
            end,
            update = {
                "ModeChanged",
                pattern = "*:*",
                callback = vim.schedule_wrap(function()
                    vim.cmd("redrawstatus")
                end),
            },
        }

        local FileNameBlock = {
            init = function(self)
                self.filename = vim.api.nvim_buf_get_name(0)
            end,
            hl = { bg = "bg_highlight" },
            Block,
            {
                provider = function(self)
                    -- see :h filename-modifers
                    local filename = vim.fn.fnamemodify(self.filename, ":~:.")
                    if filename == "" then
                        return "[No Name]"
                    end
                    if not conditions.width_percent_below(#filename, 0.25) then
                        filename = vim.fn.fnamemodify(self.filename, ":t")
                    end
                    return filename
                end,
                hl = { fg = "directory" },
            },
            {
                condition = function()
                    return vim.bo.modified
                end,
                provider = " [+]",
                hl = { fg = "green" },
            },
            {
                condition = function()
                    return not vim.bo.modifiable or vim.bo.readonly
                end,
                provider = " ",
                hl = { fg = "orange" },
            },
            Block,
            { provider = "%<" }, -- cut here when there's not enough space
        }

        local DefaultStatusLine = {
            ViMode,
            FileNameBlock,
        }

        heirline.setup({
            statusline = {
                DefaultStatusLine,
            },
            opts = {
                colors = colors,
            },
        })
    end,
}
