return {
    "rebelot/heirline.nvim",
    event = { "UiEnter", "VeryLazy" },
    dependencies = {
        "Zeioth/heirline-components.nvim",
    },
    init = function()
        vim.opt.laststatus = 2
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
            "diffRemoved",
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
            git_add = hl.diffAdded.fg,
            git_del = hl.diffRemoved.fg,
            git_change = hl.diffChanged.fg,
            directory = hl.Directory.fg,
        }

        local mode_colors = {
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
        }

        local Space = {
            provider = " ",
        }

        local ViMode = {
            flexible = true,
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
                mode_colors = mode_colors,
            },
            hl = function(self)
                local mode = self.mode:sub(1, 1)
                vim.g.heirline_mode_color = self.mode_colors[mode]
                return { fg = "bg", bg = vim.g.heirline_mode_color, bold = true }
            end,
            update = {
                "ModeChanged",
                pattern = "*:*",
                callback = vim.schedule_wrap(function()
                    vim.cmd("redrawstatus")
                end),
            },
            {
                provider = function(self)
                    return " " .. self.mode_names[self.mode] .. " "
                end,
            },
            {
                provider = function(self)
                    return " " .. self.short_mode_names[self.mode] .. " "
                end,
            },
        }

        local FileName = {
            flexible = true,
            init = function(self)
                self.filename = vim.api.nvim_buf_get_name(0)
            end,
            {
                provider = function(self)
                    local filename = vim.fn.fnamemodify(self.filename, ":~:.")
                    if filename == "" then
                        return "[No Name]"
                    end
                    return filename
                end,
            },
            {
                provider = function(self)
                    local filename = vim.fn.fnamemodify(self.filename, ":t")
                    if filename == "" then
                        return "[No Name]"
                    end
                    return filename
                end,
            },
        }

        local FileNameBlock = {
            hl = { bg = "bg_highlight" },
            Space,
            {

                hl = function()
                    return { fg = vim.g.heirline_mode_color }
                end,
                FileName,
            },
            {
                condition = function()
                    return vim.bo.modified
                end,
                provider = " ●",
                hl = { fg = "green" },
            },
            {
                condition = function()
                    return not vim.bo.modifiable or vim.bo.readonly
                end,
                provider = " ",
                hl = { fg = "orange" },
            },
            Space,
            { provider = "%<" }, -- cut here when there's not enough space
        }

        local Git = {
            condition = conditions.is_git_repo,
            init = function(self)
                self.status_dict = vim.b.gitsigns_status_dict
            end,
            {
                provider = function(self)
                    return " " .. self.status_dict.head .. " "
                end,
                hl = { bold = true },
            },
            {
                provider = function(self)
                    local count = self.status_dict.added or 0
                    return count > 0 and ("+" .. count .. " ")
                end,
                hl = { fg = "git_add" },
            },
            {
                provider = function(self)
                    local count = self.status_dict.removed or 0
                    return count > 0 and ("-" .. count .. " ")
                end,
                hl = { fg = "git_del" },
            },
            {
                provider = function(self)
                    local count = self.status_dict.changed or 0
                    return count > 0 and ("~" .. count .. " ")
                end,
                hl = { fg = "git_change" },
            },
        }

        local Diagnostics = {
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

        local LspClientCount = {
            condition = conditions.lsp_attached,
            provider = function()
                local bufnr = vim.api.nvim_get_current_buf()
                local client_count = #vim.lsp.get_clients({ bufnr = bufnr })
                return " " .. client_count
            end,
            update = { "LspAttach", "LspDetach" },
        }

        local Position = {
            provider = function()
                local pos = vim.api.nvim_win_get_cursor(vim.api.nvim_get_current_win())
                return string.format("󱋼 %d:%d", pos[1], pos[2] + 1)
            end,
        }

        local LeftSeparator = {
            provider = " ❬ ",
        }

        local FileType = {
            init = function(self)
                self.bufnr = vim.api.nvim_get_current_buf()
                self.filename = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(self.bufnr), ":t")
                self.extension = vim.fn.fnamemodify(self.filename, ":e")
                self.filetype = vim.bo[self.bufnr].filetype:upper()

                if self.filetype == "YAML" then
                    local schema = require("yaml-companion").get_buf_schema(0)
                    if schema and schema.result[1].name ~= "none" then
                        self.filetype = string.format("%s (%s)", self.filetype, schema.result[1].name)
                    end
                end

                self.icon_str, self.icon_hlname =
                    require("nvim-web-devicons").get_icon(self.filename, self.extension, { default = true })
            end,
            {
                provider = function(self)
                    return self.icon_str
                end,
                hl = function(self)
                    local icon_fg = vim.api.nvim_get_hl(0, { name = self.icon_hlname }).fg

                    if icon_fg then
                        return {
                            fg = string.format("#%06x", icon_fg),
                        }
                    end

                    return {}
                end,
            },
            {
                provider = function(self)
                    return " " .. self.filetype
                end,
            },
        }

        local FileEncoding = {
            provider = function(self)
                local file_enc = (vim.bo[self.bufnr].fenc ~= "" and vim.bo[self.bufnr].fenc) or vim.o.enc
                return file_enc:upper()
            end,
        }

        local FileFormat = {
            provider = function(self)
                local file_format = vim.bo[self.bufnr].fileformat
                return file_format:upper()
            end,
        }

        local TabStyle = {
            provider = function(self)
                local tab_style = vim.api.nvim_get_option_value("expandtab", { buf = self.bufnr }) and "●" or "󰌒"
                local tab = vim.api.nvim_get_option_value("shiftwidth", { buf = self.bufnr })

                if tab == 0 then
                    tab = vim.api.nvim_get_option_value("tabstop", { buf = self.bufnr })
                end

                return tab_style .. " " .. tab
            end,
        }

        local LineCount = {
            provider = function(self)
                local lines = vim.api.nvim_buf_line_count(self.bufnr)
                return " " .. lines
            end,
        }

        local FileStats = {
            init = function(self)
                self.bufnr = vim.api.nvim_get_current_buf()
            end,
            hl = { bg = "bg_highlight" },
            flexible = true,
            {
                { Space, FileEncoding },
                { LeftSeparator, FileFormat },
                { LeftSeparator, TabStyle },
                { LeftSeparator, LineCount },
                Space,
            },
            {
                { Space, FileFormat },
                { LeftSeparator, TabStyle },
                { LeftSeparator, LineCount },
                Space,
            },
            {
                { Space, TabStyle },
                { LeftSeparator, LineCount },
                Space,
            },
            {
                Space,
                LineCount,
                Space,
            },
        }

        local Ruler = {
            hl = function()
                return { fg = "bg", bg = vim.g.heirline_mode_color, bold = true }
            end,
            provider = " %P ",
        }

        local Align = {
            provider = "%=",
        }

        local DefaultStatusLine = {
            -- LHS
            ViMode,
            FileNameBlock,
            Space,
            Git,
            Align,
            -- RHS
            Diagnostics,
            Space,
            Position,
            Space,
            LspClientCount,
            LeftSeparator,
            FileType,
            Space,
            FileStats,
            Ruler,
        }

        local WindowNumber = {
            provider = function()
                return tostring(vim.api.nvim_win_get_number(0))
            end,
        }

        local BgHighlight = function(component)
            return {
                hl = { bg = "bg_highlight" },
                Space,
                component,
                Space,
            }
        end

        local InactiveStatusLine = {
            condition = conditions.is_not_active,
            hl = { fg = "fg" },
            BgHighlight(FileType),
            Space,
            FileName,
            Align,
            BgHighlight(WindowNumber),
        }

        local HelpFileName = {
            provider = function()
                local buftype = vim.bo.buftype
                if buftype == "nofile" then
                    return "[No File]"
                elseif buftype == "prompt" then
                    return "[Prompt]"
                elseif buftype == "help" then
                    return "[Help]"
                elseif buftype == "quickfix" then
                    return "[Quickfix]"
                end
                local filename = vim.api.nvim_buf_get_name(0)
                return vim.fn.fnamemodify(filename, ":t")
            end,
            hl = { fg = "blue" },
        }

        local SpecialStatusLine = {
            condition = function()
                return conditions.buffer_matches({
                    buftype = { "nofile", "prompt", "help", "quickfix" },
                    filetype = { "^git.*", "fugitive" },
                })
            end,
            BgHighlight(FileType),
            Space,
            HelpFileName,
            Align,
            BgHighlight(WindowNumber),
        }

        local TerminalName = {
            provider = function()
                local tname, _ = vim.api.nvim_buf_get_name(0):gsub(".*:", "")
                return " " .. tname
            end,
            hl = { fg = "blue", bold = true },
        }

        local TerminalStatusLine = {
            condition = function()
                return conditions.buffer_matches({ buftype = { "terminal" } })
            end,
            ViMode,
            Space,
            TerminalName,
            Align,
            BgHighlight(WindowNumber),
        }

        heirline.setup({
            statusline = {
                hl = function()
                    if conditions.is_active() then
                        return "StatusLine"
                    else
                        return "StatusLineNC"
                    end
                end,
                fallthrough = false,
                InactiveStatusLine,
                SpecialStatusLine,
                TerminalStatusLine,
                DefaultStatusLine,
            },
            opts = {
                colors = colors,
            },
        })
    end,
}
