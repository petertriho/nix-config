return {
    -- NOTE: vim.lsp.get_active_clients is deprecated, using fork until PR is merged
    -- "kosayoda/nvim-lightbulb"
    "gh-liu/nvim-lightbulb",
    event = "User LazyLoadFile",
    opts = {
        link_highlights = false,
        autocmd = { enabled = true },
        sign = {
            text = "󰌶",
            hl = "DiagnosticSignWarn",
        },
    },
}
