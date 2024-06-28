return {
    "monaqa/dial.nvim",
    keys = {
        "<Plug>(dial-increment)",
        "<Plug>(dial-decrement)",
    },
    init = function()
        local keymap = vim.keymap.set

        keymap("", "<C-a>", "<Plug>(dial-increment)", {})
        keymap("", "<C-x>", "<Plug>(dial-decrement)", {})
        keymap("v", "g<C-a>", "g<Plug>(dial-increment)", {})
        keymap("v", "g<C-x>", "g<Plug>(dial-decrement)", {})
    end,
}
