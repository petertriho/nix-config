return {
    "nmac427/guess-indent.nvim",
    event = "User LazyLoadFile",
    config = function()
        require("guess-indent").setup({})
    end,
}
