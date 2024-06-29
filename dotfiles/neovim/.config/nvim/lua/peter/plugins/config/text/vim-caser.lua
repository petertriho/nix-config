return {
    "arthurxavierx/vim-caser",
    keys = { { "cC", mode = "n" } },
    init = function()
        vim.g.caser_prefix = "cC"
    end,
}
