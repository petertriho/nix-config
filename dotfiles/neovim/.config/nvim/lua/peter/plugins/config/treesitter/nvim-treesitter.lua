return {
    "nvim-treesitter/nvim-treesitter",
    cmd = {
        "TSUpdate",
        "TSUpdateSync",
    },
    event = { "User LazyLoadFile", "VeryLazy" },
    build = ":TSUpdateSync",
    config = function()
        require("nvim-treesitter.configs").setup({
            ensure_installed = {
                -- "comment",
                "markdown_inline",
                "regex",
                "vimdoc",
                unpack(require("peter.core.filetypes").treesitter),
            },
            sync_install = true,
            highlight = {
                enable = true,
                use_languagetree = false,
            },
            incremental_selection = {
                enable = true,
                keymaps = {
                    init_selection = false,
                    scope_incremental = false,
                    node_incremental = "v",
                    node_decremental = "V",
                },
            },
            indent = {
                enable = false,
                disable = { "python" },
            },
            fold = { enable = false },
        })
        require("nvim-treesitter").define_modules({
            fold = {
                attach = function()
                    vim.opt_local.foldmethod = "expr"
                    vim.opt_local.foldexpr = "nvim_treesitter#foldexpr()"
                    vim.opt_local.foldminlines = 1
                    vim.opt_local.foldnestmax = 3
                    vim.opt_local.foldlevel = 3
                    vim.opt_local.foldtext =
                        "substitute(getline(v:foldstart),'\\t',repeat(' ',&tabstop),'g').'...'.trim(getline(v:foldend)).' ('.(v:foldend-v:foldstart+1).' lines)'"
                end,
                detach = function() end,
                is_supported = function()
                    return true
                end,
            },
        })

        local parser_config = require("nvim-treesitter.parsers").get_parser_configs()
        parser_config.markdown.filetype_to_parsername = "octo"

        vim.api.nvim_exec_autocmds("User", { pattern = "LoadedNvimTreesitter" })
    end,
}
