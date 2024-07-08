return {
    "neovim/nvim-lspconfig",
    event = { "User LazyLoadFile", "VeryLazy" },
    config = function()
        require("peter.lsp").setup()
    end,
}
