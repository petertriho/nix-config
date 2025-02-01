return {
    "echasnovski/mini.nvim",
    event = { "User LazyLoadFile", "VeryLazy" },
    config = function()
        require("mini.ai").setup()
        require("mini.splitjoin").setup()
    end,
}
