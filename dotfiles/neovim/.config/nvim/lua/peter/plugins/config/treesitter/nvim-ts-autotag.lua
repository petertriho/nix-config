return {
    "windwp/nvim-ts-autotag",
    event = "User LoadedNvimTreesitter",
    config = function()
        require("nvim-treesitter.configs").setup({ autotag = { enable = true } })
    end,
}
