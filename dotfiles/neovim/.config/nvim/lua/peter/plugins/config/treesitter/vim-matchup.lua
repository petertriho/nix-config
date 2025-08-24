return {
    "andymass/vim-matchup",
    event = "User LoadedNvimTreesitter",
    keys = {
        {
            "im",
            "<Plug>(matchup-i%)",
            desc = "Inside a matched pair",
            mode = { "o", "x" },
        },
        {
            "am",
            "<Plug>(matchup-a%)",
            desc = "Around a matched pair",
            mode = { "o", "x" },
        },
    },
    config = function()
        require("nvim-treesitter.configs").setup({
            matchup = { enable = true },
        })
        vim.g.matchup_matchparen_offscreen = {}
        vim.g.matchup_matchparen_deferred = 1
        vim.api.nvim_del_keymap("", "z%")
    end,
}
