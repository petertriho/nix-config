return {
    "RRethy/nvim-treesitter-textsubjects",
    event = "User LoadedNvimTreesitter",
    config = function()
        require("nvim-treesitter.configs").setup({
            textsubjects = {
                enable = true,
                prev_selection = "<BS>",
                keymaps = {
                    ["."] = { "textsubjects-smart", desc = "TS Smart" },
                    ["<CR>"] = { "textsubjects-container-outer", desc = "TS Outer" },
                    ["i<CR>"] = { "textsubjects-container-inner", desc = "TS Inner" },
                },
            },
        })
    end,
}
