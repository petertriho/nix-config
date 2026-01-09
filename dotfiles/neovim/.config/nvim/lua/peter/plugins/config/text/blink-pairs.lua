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

        -- Save the original <BS> mapping before blink.pairs overrides it
        local original_bs = vim.fn.maparg("<BS>", "i", false, true)

        require("blink.pairs").setup(opts)

        -- Unmap blink.pairs' <BS> mapping and restore the original
        if original_bs and next(original_bs) then
            vim.keymap.del("i", "<BS>")

            local opts_table = {}
            if original_bs.desc then
                opts_table.desc = original_bs.desc
            end
            if original_bs.silent == 1 then
                opts_table.silent = true
            end
            if original_bs.noremap == 1 then
                opts_table.noremap = true
            end
            if original_bs.expr == 1 then
                opts_table.expr = true
            end
            if original_bs.nowait == 1 then
                opts_table.nowait = true
            end
            if original_bs.buffer ~= 0 then
                opts_table.buffer = original_bs.buffer
            end

            vim.keymap.set("i", "<BS>", original_bs.callback or original_bs.rhs, opts_table)
        end
    end,
}
