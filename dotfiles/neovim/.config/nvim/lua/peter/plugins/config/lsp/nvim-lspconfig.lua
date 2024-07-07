return {
    "neovim/nvim-lspconfig",
    config = function()
        require("peter.lsp").setup()
    end,
}
