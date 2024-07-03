return {
    "monaqa/dial.nvim",
    keys = {
        "<Plug>(dial-increment)",
        "<Plug>(dial-decrement)",
        { "<C-a>", "<Plug>(dial-increment)", mode = { "n", "v" } },
        { "<C-x>", "<Plug>(dial-decrement)", mode = { "n", "v" } },
        { "g<C-a>", "g<Plug>(dial-increment)", mode = "v" },
        { "g<C-x>", "g<Plug>(dial-decrement)", mode = "v" },
    },
}
