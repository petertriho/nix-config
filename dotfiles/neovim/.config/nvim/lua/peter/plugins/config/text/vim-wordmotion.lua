return {
    "chaoren/vim-wordmotion",
    event = "VeryLazy",
    init = function()
        vim.g.wordmotion_prefix = "\\"
    end,
}
