return {
    "folke/tokyonight.nvim",
    lazy = false,
    priority = 1000,
    config = function()
        require("tokyonight").setup({
            style = "night",
            sidebars = require("peter.plugins.filetypes").sidebars,
            on_colors = function(colors)
                colors.border_highlight = "#2d3149"
            end,
            on_highlights = function(hl, colors)
                hl.ConflictMarkerBegin = { bg = colors.diff.add }
                hl.ConflictMarkerOurs = { bg = colors.diff.add }
                hl.ConflictMarkerCommonAncestors = { bg = colors.diff.delete }
                hl.ConflictMarkerCommonAncestorsHunk = { bg = colors.diff.delete }
                hl.ConflictMarkerSeparator = { bg = colors.diff.change }
                hl.ConflictMarkerTheirs = { bg = colors.diff.change }
                hl.ConflictMarkerEnd = { bg = colors.diff.change }

                hl.EyelinerPrimary = { fg = colors.blue, underline = true }
                hl.EyelinerSecondary = { fg = colors.red, underline = true }

                hl.Folded = { fg = colors.comment, bg = nil }

                hl.LeapLabel = { fg = colors.red, underline = true }
                hl.LeapMatch = { fg = colors.blue, underline = true }

                -- hl.TelescopeNormal = {
                --     bg = colors.bg_dark,
                --     fg = colors.fg_dark,
                -- }
                -- hl.TelescopeBorder = {
                --     bg = colors.bg_dark,
                --     fg = colors.bg_dark,
                -- }
                -- hl.TelescopePromptNormal = {
                --     bg = colors.border_highlight,
                -- }
                -- hl.TelescopePromptBorder = {
                --     bg = colors.border_highlight,
                --     fg = colors.border_highlight,
                -- }
                -- hl.TelescopePromptTitle = {
                --     bg = colors.border_highlight,
                --     fg = colors.fg_dark,
                -- }
                -- hl.TelescopePreviewTitle = {
                --     bg = colors.border_highlight,
                --     fg = colors.fg_dark,
                -- }
                -- hl.TelescopeResultsTitle = {
                --     bg = colors.border_highlight,
                --     fg = colors.fg_dark,
                -- }
            end,
        })

        vim.cmd("colorscheme tokyonight")

        vim.fn.sign_define("LightBulbSign", { text = "󰌶", texthl = "DiagnosticSignWarn" })

        vim.diagnostic.config({
            signs = {
                text = {
                    [vim.diagnostic.severity.ERROR] = "󰅚 ",
                    [vim.diagnostic.severity.WARN] = "󰀪 ",
                    [vim.diagnostic.severity.INFO] = " ",
                    [vim.diagnostic.severity.HINT] = "󰌶 ",
                },
                linehl = {
                    [vim.diagnostic.severity.ERROR] = "DiagnosticSignError",
                    [vim.diagnostic.severity.WARN] = "DiagnosticSignWarn",
                    [vim.diagnostic.severity.INFO] = "DiagnosticSignInfo",
                    [vim.diagnostic.severity.HINT] = "DiagnosticSignHint",
                },
                numhl = {

                    [vim.diagnostic.severity.ERROR] = "",
                    [vim.diagnostic.severity.WARN] = "",
                    [vim.diagnostic.severity.INFO] = "",
                    [vim.diagnostic.severity.HINT] = "",
                },
            },
        })
    end,
}
