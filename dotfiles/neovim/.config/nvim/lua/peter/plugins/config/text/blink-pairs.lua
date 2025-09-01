return {
    "saghen/blink.pairs",
    build = "nix run .#build-plugin",
    event = "User LazyLoadFile",
    opts = {
        mappings = {
            enabled = true,
            cmdline = true,
            disabled_filetypes = {},
            pairs = {
                ["("] = { ")", space = false },
                ["["] = { "]", space = false },
                ["{"] = { "}", space = false },
            },
        },
        highlights = {
            enabled = true,
            cmdline = false,
            groups = {
                "BlinkPairsBlue",
                "BlinkPairsYellow",
                "BlinkPairsGreen",
                "BlinkPairsTeal",
                "BlinkPairsMagenta",
                "BlinkPairsPurple",
                "BlinkPairsOrange",
                "BlinkPairsRed",
            },
            unmatched_group = "BlinkPairsUnmatched",
            matchparen = {
                enabled = false,
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
