return {
    "yioneko/nvim-yati",
    event = "User LoadedNvimTreesitter",
    config = function()
        require("nvim-treesitter.configs").setup({
            yati = {
                enable = true,
                default_lazy = true,
                default_fallback = "auto",
            },
        })
    end,
}
