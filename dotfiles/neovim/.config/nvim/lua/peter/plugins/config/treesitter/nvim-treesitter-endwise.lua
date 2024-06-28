return {
    "RRethy/nvim-treesitter-endwise",
    event = "User LoadedNvimTreesitter",
    config = function()
        require("nvim-treesitter.configs").setup({
            endwise = {
                enable = true,
            },
        })
    end,
}
