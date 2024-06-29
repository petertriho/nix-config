return {
    "RRethy/nvim-treesitter-textsubjects",
    event = "User LoadedNvimTreesitter",
    config = function()
        local textobjects = {
            ["."] = "textsubjects-smart",
            ["<CR>"] = "textsubjects-container-outer",
            ["i<CR>"] = "textsubjects-container-inner",
        }

        require("nvim-treesitter.configs").setup({
            textsubjects = {
                enable = true,
                prev_selection = "<BS>",
                keymaps = textobjects,
            },
        })
    end,
}
