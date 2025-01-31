return {
    "git@github.com:petertriho/feline.nvim.git",
    event = { "UiEnter", "VeryLazy" },
    init = function()
        vim.opt.laststatus = 3
    end,
    config = function()
        local colors = require("peter.plugins.colors")

        local vi_mode_colors = {
            NORMAL = "blue",
            OP = "blue",
            INSERT = "green",
            VISUAL = "magenta",
            BLOCK = "magenta",
            LINES = "magenta",
            REPLACE = "red",
            ["V-REPLACE"] = "red",
            ENTER = "blue",
            MORE = "blue",
            SELECT = "magenta",
            COMMAND = "yellow",
            SHELL = "blue",
            TERM = "blue",
            NONE = "orange",
        }

        local lsp = require("feline.providers.lsp")
        local vi_mode_utils = require("feline.providers.vi_mode")

        local components = {
            active = { {}, {} },
            inactive = { {}, {} },
        }

        components.active[1] = {
            {
                provider = { name = "vi_mode", opts = { show_mode_name = true } },
                short_provider = "vi_mode_short",
                icon = "",
                hl = function()
                    return {
                        fg = "black",
                        bg = vi_mode_utils.get_mode_color(),
                        style = "bold",
                    }
                end,
                left_sep = "block",
                right_sep = "block",
            },
            {
                provider = { name = "file_info", opts = { type = "relative", file_readonly_icon = " " } },
                short_provider = { name = "file_info", opts = { type = "base-only", file_readonly_icon = " " } },
                icon = "",
                hl = function()
                    return {
                        fg = vi_mode_utils.get_mode_color(),
                        bg = "bg_highlight",
                        style = "bold",
                    }
                end,
                left_sep = "block",
                right_sep = "block",
                priority = 0,
            },
            {
                provider = "git_branch",
                icon = " ",
                enabled = function()
                    return vim.b.gitsigns_status_dict
                end,
                left_sep = " ",
                right_sep = {
                    " ",
                    {
                        str = "❭",
                        hl = {
                            fg = "fg_sidebar",
                            bg = "bg",
                        },
                    },
                },
                truncate_hide = true,
            },
            {
                provider = "git_diff_added",
                icon = " +",
                hl = { fg = "teal", style = "bold" },
                truncate_hide = true,
                priority = 3,
            },
            {
                provider = "git_diff_changed",
                icon = " ~",
                hl = { fg = "blue", style = "bold" },
                truncate_hide = true,
                priority = 3,
            },
            {
                provider = "git_diff_removed",
                icon = " -",
                hl = { fg = "red", style = "bold" },
                right_sep = "block",
                truncate_hide = true,
                priority = 3,
            },
        }

        components.active[2] = {
            {
                provider = "position_2",
                left_sep = " ",
            },
            {
                provider = "diagnostic_info",
                enabled = function()
                    return lsp.diagnostics_exist(vim.diagnostic.severity.INFO)
                end,
                icon = "  ",
                hl = { fg = "info" },
                truncate_hide = true,
                priority = 2,
            },
            {
                provider = "diagnostic_hints",
                enabled = function()
                    return lsp.diagnostics_exist(vim.diagnostic.severity.HINT)
                end,
                icon = " 󰌶 ",
                hl = { fg = "hint" },
                truncate_hide = true,
                priority = 2,
            },
            {
                provider = "diagnostic_warnings",
                enabled = function()
                    return lsp.diagnostics_exist(vim.diagnostic.severity.WARN)
                end,
                icon = " 󰀪 ",
                hl = { fg = "warning" },
                truncate_hide = true,
                priority = 2,
            },
            {
                provider = "diagnostic_errors",
                enabled = function()
                    return lsp.diagnostics_exist(vim.diagnostic.severity.ERROR)
                end,
                icon = " 󰅚 ",
                hl = { fg = "error" },
                truncate_hide = true,
                priority = 2,
            },
            {
                provider = "lsp_client_count",
                hl = function()
                    if not vim.g.completion_enabled then
                        return {
                            fg = "error",
                            bg = "bg",
                        }
                    end
                    return {
                        fg = "fg_sidebar",
                        bg = "bg",
                    }
                end,
                left_sep = " ",
                truncate_hide = true,
                priority = 2,
            },
            {
                provider = "file_type_2",
                enabled = function()
                    return vim.bo.filetype ~= ""
                end,
                left_sep = {
                    " ",
                    {
                        str = "❬",
                        hl = {
                            fg = "fg_sidebar",
                            bg = "bg",
                        },
                    },
                    " ",
                },
            },
            {
                provider = "file_stats",
                short_provider = { name = "file_stats", opts = { short = true } },
                hl = function()
                    return {
                        fg = "fg_sidebar",
                        bg = "bg_highlight",
                        style = "bold",
                    }
                end,
                left_sep = { " ", "block" },
                right_sep = "block",
                priority = 1,
            },
            {
                provider = "line_percentage",
                hl = function()
                    return {
                        fg = "black",
                        bg = vi_mode_utils.get_mode_color(),
                        style = "bold",
                    }
                end,
                left_sep = "block",
                right_sep = "block",
            },
        }

        components.inactive[1] = {
            {
                provider = { name = "file_info", opts = { type = "relative", file_readonly_icon = " " } },
                short_provider = { name = "file_info", opts = { type = "base-only", file_readonly_icon = " " } },
                icon = "",
                hl = { fg = "fg_sidebar", bg = "bg_highlight" },
                left_sep = "block",
                right_sep = "block",
            },
        }

        components.inactive[2] = {
            {
                provider = function()
                    return tostring(vim.api.nvim_win_get_number(0))
                end,
                left_sep = " ",
                right_sep = " ",
            },
        }

        require("feline").setup({
            theme = colors,
            vi_mode_colors = vi_mode_colors,
            components = components,
            force_inactive = {
                filetypes = require("peter.core.filetypes").excludes,
                buftypes = {},
                bufnames = {},
            },
            disable = {
                filetypes = {},
                buftypes = { "^terminal$" },
                bufnames = {},
            },
            custom_providers = {
                vi_mode_short = function(component, opts)
                    local str, o = vi_mode_utils.get_vim_mode(component, opts)
                    return string.sub(str, 1, 1), o
                end,
                file_type_2 = function()
                    local bufnr = vim.api.nvim_get_current_buf()
                    local filename = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(bufnr), ":t")
                    local extension = vim.fn.fnamemodify(filename, ":e")
                    local filetype = vim.bo[bufnr].filetype:upper()

                    if filetype == "YAML" then
                        local schema = require("yaml-companion").get_buf_schema(0)
                        if schema and schema.result[1].name ~= "none" then
                            filetype = string.format("%s (%s)", filetype, schema.result[1].name)
                        end
                    end

                    local icon_str, icon_hlname =
                        require("nvim-web-devicons").get_icon(filename, extension, { default = true })

                    local icon = { str = icon_str }

                    local fg = vim.api.nvim_get_hl(0, { name = icon_hlname }).fg

                    if fg then
                        icon.hl = { fg = string.format("#%06x", fg) }
                    end
                    return " " .. filetype, icon
                end,
                position_2 = function()
                    return string.format(
                        " %d:%d",
                        unpack(vim.api.nvim_win_get_cursor(vim.api.nvim_get_current_win()))
                    )
                end,
                file_stats = function(_, opts)
                    local bufnr = vim.api.nvim_get_current_buf()
                    local lines = vim.api.nvim_buf_line_count(bufnr)

                    if opts.short == true then
                        return string.format(" %d", lines)
                    else
                        local file_enc = (vim.bo[bufnr].fenc ~= "" and vim.bo[bufnr].fenc) or vim.o.enc
                        local file_format = vim.bo[bufnr].fileformat

                        local tab_style = vim.api.nvim_get_option_value("expandtab", { buf = bufnr }) and "●"
                            or "󰌒"
                        local tab = vim.api.nvim_get_option_value("shiftwidth", { buf = bufnr })

                        if tab == 0 then
                            tab = vim.api.nvim_get_option_value("tabstop", { buf = bufnr })
                        end

                        return string.format(
                            "%s ❬ %s ❬ %s %d ❬  %d",
                            file_enc:upper(),
                            file_format:upper(),
                            tab_style,
                            tab,
                            lines
                        )
                    end
                end,
                lsp_client_count = function()
                    return string.format(" %d", #vim.lsp.get_clients({ bufnr = vim.api.nvim_get_current_buf() }))
                end,
            },
        })
    end,
}
