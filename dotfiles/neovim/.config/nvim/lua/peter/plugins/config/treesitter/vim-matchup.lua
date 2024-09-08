return {
    "andymass/vim-matchup",
    event = "User LoadedNvimTreesitter",
    config = function()
        require("nvim-treesitter.configs").setup({
            matchup = { enable = true },
        })
        vim.g.matchup_matchparen_offscreen = {}
        vim.g.matchup_matchparen_deferred = 1
        vim.api.nvim_del_keymap("", "z%")
    end,
}
