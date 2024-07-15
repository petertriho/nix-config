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
            end,
        })

        vim.cmd("colorscheme tokyonight")

        vim.fn.sign_define("LightBulbSign", { text = "󰌶", texthl = "DiagnosticSignWarn" })
    end,
}
