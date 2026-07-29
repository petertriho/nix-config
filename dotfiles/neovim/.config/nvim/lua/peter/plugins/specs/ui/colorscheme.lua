local theme_path = vim.fs.joinpath(vim.fn.fnamemodify(vim.fn.stdpath("config"), ":h"), "stylix", "neovim.lua")
local load_theme, load_error = loadfile(theme_path)

if not load_theme then
    error(("Unable to load generated Neovim theme %s: %s"):format(theme_path, load_error))
end

local theme = load_theme()

local function build_highlights(colors)
    return {
        BlinkPairsBlue = { fg = colors.blue },
        BlinkPairsYellow = { fg = colors.yellow },
        BlinkPairsGreen = { fg = colors.green },
        BlinkPairsTeal = { fg = colors.teal },
        BlinkPairsMagenta = { fg = colors.magenta },
        BlinkPairsPurple = { fg = colors.purple },
        BlinkPairsOrange = { fg = colors.orange },
        BlinkPairsRed = { fg = colors.red },
        BlinkPairsUnmatched = { fg = colors.error, underline = true, bold = true },

        ConflictMarkerBegin = { bg = colors.diff.add },
        ConflictMarkerOurs = { bg = colors.diff.add },
        ConflictMarkerCommonAncestors = { bg = colors.diff.delete },
        ConflictMarkerCommonAncestorsHunk = { bg = colors.diff.delete },
        ConflictMarkerSeparator = { bg = colors.diff.change },
        ConflictMarkerTheirs = { bg = colors.diff.change },
        ConflictMarkerEnd = { bg = colors.diff.change },

        DiagnosticUnnecessary = { fg = colors.hint },

        EyelinerPrimary = { fg = colors.blue, underline = true },
        EyelinerSecondary = { fg = colors.red, underline = true },

        Folded = { fg = colors.comment, bg = colors.none },

        SnacksPickerPathHidden = { fg = colors.fg },

        ScrollBarMinimapCursor = { fg = colors.fg, bg = colors.fg },
        ScrollbarMinimapSearch = { fg = colors.orange },
        ScrollbarSearch = { fg = colors.orange },

        TabLine = { fg = colors.fg_gutter, bg = colors.bg_statusline },
        TabLineSel = {
            fg = colors.fg,
            bg = colors.bg,
        },
        VisualNonText = {
            fg = colors.fg_gutter,
            bg = colors.bg_visual,
        },

        WindowPickerStatusLine = {
            fg = colors.blue,
            bg = colors.bg_statusline,
            bold = true,
        },
        WindowPickerStatusLineNC = {
            fg = colors.blue,
            bg = colors.bg_statusline,
            bold = true,
        },
        WindowPickerWinBar = {
            fg = colors.blue,
            bg = colors.bg_statusline,
            bold = true,
        },
        WindowPickerWinBarNC = {
            fg = colors.blue,
            bg = colors.bg_statusline,
            bold = true,
        },
    }
end

local function catppuccin_palette(colors)
    local color_utils = require("catppuccin.utils.colors")

    return {
        blue = colors.blue,
        yellow = colors.yellow,
        green = colors.green,
        teal = colors.teal,
        magenta = colors.pink,
        purple = colors.mauve,
        orange = colors.peach,
        red = colors.red,
        error = colors.red,
        hint = colors.teal,
        comment = colors.overlay0,
        none = colors.none,
        fg = colors.text,
        fg_gutter = colors.surface1,
        bg_statusline = colors.mantle,
        bg = colors.base,
        bg_visual = colors.surface1,
        diff = {
            add = color_utils.darken(colors.green, 0.18, colors.base),
            change = color_utils.darken(colors.blue, 0.07, colors.base),
            delete = color_utils.darken(colors.red, 0.18, colors.base),
        },
    }
end

return {
    {
        "folke/tokyonight.nvim",
        lazy = false,
        priority = 1000,
        config = function()
            if theme.alias ~= "tokyonight" then
                return
            end

            require("tokyonight").setup({
                style = "night",
                sidebars = require("peter.core.filetypes").sidebars,
                on_highlights = function(highlights, colors)
                    for group, highlight in pairs(build_highlights(colors)) do
                        highlights[group] = highlight
                    end
                end,
                plugins = { markdown = true, rainbow = true },
            })
            vim.cmd.colorscheme("tokyonight")
            vim.g.colors_name = "tokyonight"
        end,
    },
    {
        "catppuccin/nvim",
        name = "catppuccin",
        lazy = false,
        priority = 1000,
        config = function()
            if theme.alias ~= "catppuccin" then
                return
            end

            require("catppuccin").setup({
                flavour = "mocha",
                background = { dark = "mocha" },
                auto_integrations = true,
                custom_highlights = function(colors)
                    return build_highlights(catppuccin_palette(colors))
                end,
            })
            vim.cmd.colorscheme("catppuccin-mocha")
        end,
    },
    {
        dir = vim.fn.stdpath("config"),
        name = "stylix-colorscheme",
        dependencies = theme.alias ~= "tokyonight" and theme.alias ~= "catppuccin" and { "nvim-mini/mini.nvim" } or {},
        lazy = false,
        priority = 1000,
        config = function()
            if theme.alias == "tokyonight" or theme.alias == "catppuccin" then
                return
            end

            require("mini.base16").setup({
                palette = theme.base16,
                use_cterm = true,
            })
            vim.g.colors_name = "mini.base16"

            for group, highlight in pairs(build_highlights(theme.semantic)) do
                vim.api.nvim_set_hl(0, group, highlight)
            end
        end,
    },
}
