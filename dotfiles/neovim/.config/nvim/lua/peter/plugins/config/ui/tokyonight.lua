return {
    "folke/tokyonight.nvim",
    lazy = false,
    priority = 1000,
    config = function()
        require("tokyonight").setup({
            style = "night",
            sidebars = require("peter.core.filetypes").sidebars,
            on_highlights = function(hl, colors)
                hl.BlinkPairsBlue = { fg = colors.blue }
                hl.BlinkPairsYellow = { fg = colors.yellow }
                hl.BlinkPairsGreen = { fg = colors.green }
                hl.BlinkPairsTeal = { fg = colors.teal }
                hl.BlinkPairsMagenta = { fg = colors.magenta }
                hl.BlinkPairsPurple = { fg = colors.purple }
                hl.BlinkPairsOrange = { fg = colors.orange }
                hl.BlinkPairsRed = { fg = colors.red }
                hl.BlinkPairsUnmatched = { fg = colors.error, underline = true, bold = true }

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

                hl.SnacksPickerPathHidden = { fg = colors.fg }

                hl.TabLine = { fg = colors.fg_gutter, bg = colors.bg_statusline }
                hl.TabLineSel = {
                    fg = colors.fg,
                    bg = colors.bg,
                }
                hl.VisualNonText = {
                    fg = colors.fg_gutter,
                    bg = colors.bg_visual,
                }

                hl.WindowPickerStatusLine = {
                    fg = colors.fg,
                    bg = colors.bg_statusline,
                }
                hl.WindowPickerStatusLineNC = {
                    fg = colors.fg,
                    bg = colors.bg_statusline,
                }
                hl.WindowPickerWinBar = {
                    fg = colors.fg,
                    bg = colors.bg_statusline,
                }
                hl.WindowPickerWinBarNC = {
                    fg = colors.fg,
                    bg = colors.bg_statusline,
                }
            end,
            plugins = { markdown = true, rainbow = true },
        })

        vim.cmd.colorscheme("tokyonight")
    end,
}
