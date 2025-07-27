return {
    "gbprod/yanky.nvim",
    event = { "User LazyLoadFile", "VeryLazy" },
    keys = {
        "<Plug>(YankyYank)",
        { "y", "<Plug>(YankyYank)", mode = { "n", "x" }, desc = "Yank" },
        { "Y", "y$", desc = "Yank EOL" },
        { "p", "<Plug>(YankyPutAfter)", mode = { "n", "x" }, desc = "Put Before" },
        { "P", "<Plug>(YankyPutBefore)", mode = { "n", "x" }, desc = "Put After" },
        { "]p", "<Plug>(YankyGPutAfter)", mode = { "n", "x" }, desc = "GPut After" },
        { "[p", "<Plug>(YankyGPutBefore)", mode = { "n", "x" }, desc = "GPut Before" },
        { "]y", "<Plug>(YankyNextEntry)", desc = "Yank Next Entry" },
        { "[y", "<Plug>(YankyPreviousEntry)", desc = "Yank Previous Entry" },
        { "]P", "<Plug>(YankyPutIndentAfterLinewise)", desc = "Put After Line" },
        { "[P", "<Plug>(YankyPutIndentBeforeLinewise)", desc = "Put Before Line" },
        { ">p", "<Plug>(YankyPutIndentAfterShiftRight)", desc = "Put After Right" },
        { "<p", "<Plug>(YankyPutIndentAfterShiftLeft)", desc = "Put After Left" },
        { ">P", "<Plug>(YankyPutIndentBeforeShiftRight)", desc = "Put Before Right" },
        { "<P", "<Plug>(YankyPutIndentBeforeShiftLeft)", desc = "Put Before Left" },
        { "=p", "<Plug>(YankyPutAfterFilter)", desc = "Put After Filter" },
        { "=P", "<Plug>(YankyPutBeforeFilter)", desc = "Put Before Filter" },
    },
    config = function()
        require("yanky").setup({
            ring = {
                storage = "memory",
            },
            highlight = {
                on_put = true,
                on_yank = true,
                timer = 200,
            },
        })
    end,
}
