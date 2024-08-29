return {
    "folke/flash.nvim",
    keys = {
        {
            "s",
            mode = { "n" },
            function()
                require("flash").jump()
            end,
            desc = "Flash",
        },
        {
            "z",
            mode = { "x", "o" },
            function()
                require("flash").jump()
            end,
            desc = "Flash",
        },
        {
            "S",
            mode = { "n", "x", "o" },
            function()
                require("flash").treesitter()
            end,
            desc = "Flash Treesitter",
        },
        {
            "r",
            mode = "o",
            function()
                require("flash").remote()
            end,
            desc = "Remote Flash",
        },
        {
            "R",
            mode = { "o", "x" },
            function()
                require("flash").treesitter_search()
            end,
            desc = "Treesitter Search",
        },
        {
            "<c-s>",
            mode = { "c" },
            function()
                require("flash").toggle()
            end,
            desc = "Toggle Flash Search",
        },
    },
    opts = {
        jump = {
            autojump = true,
        },
        search = {
            multi_window = false,
        },
        modes = {
            search = {
                enabled = true,
            },
            char = {
                enabled = false,
            },
        },
    },
}
