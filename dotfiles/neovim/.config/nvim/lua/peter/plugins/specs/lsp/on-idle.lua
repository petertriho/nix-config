return {
    "https://codeberg.org/dannyfritz/on-idle.nvim",
    event = "User LazyLoadFile",
    dependencies = "neovim/nvim-lspconfig",
    opts = { timeout_seconds = 300 },
}
