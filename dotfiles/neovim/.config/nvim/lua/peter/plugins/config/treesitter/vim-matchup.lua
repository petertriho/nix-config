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
        require("match-up").setup({
            treesitter = { enabled = true },
            matchparen = {
                deferred = 1,
                offset = {},
            },
        })
        vim.api.nvim_del_keymap("", "z%")
    end,
}
