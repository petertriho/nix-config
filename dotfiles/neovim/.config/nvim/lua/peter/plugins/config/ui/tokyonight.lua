return {
    "folke/tokyonight.nvim",
    lazy = false,
    priority = 1000,
    config = function()
        require("tokyonight").setup({
            style = "night",
            sidebars = require("peter.core.filetypes").sidebars,
            on_highlights = function(hl, colors)
                hl.ConflictMarkerBegin = { bg = colors.diff.add }
                hl.ConflictMarkerOurs = { bg = colors.diff.add }
                hl.ConflictMarkerCommonAncestors = { bg = colors.diff.delete }
                hl.ConflictMarkerCommonAncestorsHunk = { bg = colors.diff.delete }
                hl.ConflictMarkerSeparator = { bg = colors.diff.change }
                hl.ConflictMarkerTheirs = { bg = colors.diff.change }
                hl.ConflictMarkerEnd = { bg = colors.diff.change }

                hl.DiagnosticUnnecessary = { fg = colors.hint }

                hl.EyelinerPrimary = { fg = colors.blue, underline = true }
                hl.EyelinerSecondary = { fg = colors.red, underline = true }

                hl.Folded = { fg = colors.comment, bg = nil }
            end,
            plugins = { markdown = true },
        })

        vim.cmd("colorscheme tokyonight")
    end,
}
