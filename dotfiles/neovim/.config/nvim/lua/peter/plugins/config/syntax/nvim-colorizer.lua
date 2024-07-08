return {
    -- NOTE: vim.lsp.get_active_clients is deprecated, using fork until PR is merged
    "calebdw/nvim-colorizer.lua",
    branch = "lsp_clients",
    event = "User LazyLoadFile",
    opts = {
        filetypes = {
            "*",
            css = { css = true, css_fn = true },
            html = { names = false },
        },
        user_default_options = {
            mode = "virtualtext",
            tailwind = "both",
        },
    },
}
