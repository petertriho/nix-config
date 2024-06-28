return {
    "neovim/nvim-lspconfig",
    event = "VeryLazy",
    config = function()
        require("peter.lsp").setup()
    end,
}
