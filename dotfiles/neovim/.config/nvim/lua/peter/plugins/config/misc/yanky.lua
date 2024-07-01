return {
    "gbprod/yanky.nvim",
    keys = {
        "<Plug>(YankyYank)",
        { "y", "<Plug>(YankyYank)", mode = { "n", "x" }, desc = "Yank" },
        { "]p", "<Plug>(YankyGPutAfter)", mode = { "n", "x" }, desc = "GPut After" },
        { "[p", "<Plug>(YankyGPutBefore)", mode = { "n", "x" }, desc = "GPut Before" },
        { "p", "<Plug>(YankyPutAfter)", mode = { "n", "x" }, desc = "Put Before" },
        { "P", "<Plug>(YankyPutBefore)", mode = { "n", "x" }, desc = "Put After" },
        { "]P", "<Plug>(YankyPutIndentAfterLinewise)", desc = "Put After Line" },
        { "[P", "<Plug>(YankyPutIndentBeforeLinewise)", desc = "Put Before Line" },
        { ">p", "<Plug>(YankyPutIndentAfterShiftRight)", desc = "Put After Right" },
        { "<p", "<Plug>(YankyPutIndentAfterShiftLeft)", desc = "Put After Left" },
        { ">P", "<Plug>(YankyPutIndentBeforeShiftRight)", desc = "Put Before Right" },
        { "<P", "<Plug>(YankyPutIndentBeforeShiftLeft)", desc = "Put Before Left" },
        { "=p", "<Plug>(YankyPutAfterFilter)", desc = "Put After Filter" },
        { "=P", "<Plug>(YankyPutBeforeFilter)", desc = "Put Before Filter" },
        { "<M-f>", "<Plug>(YankyCycleForward)", desc = "Yank Cycle Forward" },
        { "<M-b>", "<Plug>(YankyCycleBackward)", desc = "Yank Cycle Backward" },
        { "Y", "y$", desc = "Yank EOL" },
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
