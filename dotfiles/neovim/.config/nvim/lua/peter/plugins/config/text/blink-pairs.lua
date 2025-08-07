return {
    "saghen/blink.pairs",
    build = "nix run .#build-plugin",
    event = "User LazyLoadFile",
    opts = {
        mappings = {
            enabled = true,
            cmdline = true,
            disabled_filetypes = {},
            pairs = {},
        },
        highlights = {
            enabled = true,
            cmdline = true,
            groups = {
                "RainbowDelimiterRed",
                "RainbowDelimiterOrange",
                "RainbowDelimiterYellow",
                "RainbowDelimiterGreen",
                "RainbowDelimiterBlue",
                "RainbowDelimiterViolet",
                "RainbowDelimiterCyan",
            },
            unmatched_group = "SpellBad",
            matchparen = {
                enabled = true,
                cmdline = false,
                group = "MatchParen",
            },
        },
        debug = false,
    },
    config = function(_, opts)
        opts = opts or {
            mappings = {},
        }

        opts.mappings.disabled_filetypes = require("peter.core.filetypes").excludes

        require("blink.pairs").setup(opts)
    end,
}
