return {
    "RRethy/nvim-treesitter-textsubjects",
    event = "User LoadedNvimTreesitter",
    config = function()
        require("nvim-treesitter.configs").setup({
            textsubjects = {
                enable = true,
                prev_selection = "<BS>",
                keymaps = {
                    ["."] = "textsubjects-smart",
                    ["<CR>"] = "textsubjects-container-outer",
                    ["i<CR>"] = "textsubjects-container-inner",
                },
            },
        })
    end,
}
