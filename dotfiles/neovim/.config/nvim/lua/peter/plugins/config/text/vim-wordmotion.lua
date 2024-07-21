return {
    "chaoren/vim-wordmotion",
    event = "User LazyLoadFile",
    init = function()
        vim.g.wordmotion_prefix = "\\"
    end,
}
