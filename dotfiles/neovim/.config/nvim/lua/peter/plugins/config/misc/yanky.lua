return {
    "gbprod/yanky.nvim",
    keys = { "<Plug>(YankyYank)", { "y", "<Plug>(YankyYank)", modes = { "n", "x" }, desc = "Yank" } },
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

        local keymap = vim.keymap.set

        keymap({ "n", "x" }, "[p", "<Plug>(YankyGPutBefore)")
        keymap({ "n", "x" }, "]p", "<Plug>(YankyGPutAfter)")
        keymap({ "n", "x" }, "p", "<Plug>(YankyPutAfter)")
        keymap({ "n", "x" }, "P", "<Plug>(YankyPutBefore)")

        keymap("n", "]P", "<Plug>(YankyPutIndentAfterLinewise)")
        keymap("n", "[P", "<Plug>(YankyPutIndentBeforeLinewise)")
        keymap("n", ">p", "<Plug>(YankyPutIndentAfterShiftRight)")
        keymap("n", "<p", "<Plug>(YankyPutIndentAfterShiftLeft)")
        keymap("n", ">P", "<Plug>(YankyPutIndentBeforeShiftRight)")
        keymap("n", "<P", "<Plug>(YankyPutIndentBeforeShiftLeft)")
        keymap("n", "=p", "<Plug>(YankyPutAfterFilter)")
        keymap("n", "=P", "<Plug>(YankyPutBeforeFilter)")

        keymap("n", "<M-f>", "<Plug>(YankyCycleForward)")
        keymap("n", "<M-b>", "<Plug>(YankyCycleBackward)")

        keymap("n", "Y", "y$")
    end,
}
