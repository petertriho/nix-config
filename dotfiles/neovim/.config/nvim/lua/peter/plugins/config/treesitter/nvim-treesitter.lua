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
                "bash",
                -- "comment",
                "markdown_inline",
                "prisma",
                "regex",
                "todotxt",
                "tsx",
                "vimdoc",
                unpack(require("peter.plugins.filetypes").treesitter),
            },
            sync_install = true,
            highlight = {
                enable = true,
                use_languagetree = false,
                disable = function(lang, bufnr)
                    file_is_big = require("peter.core.utils").file_is_big(bufnr)
                    if file_is_big then
                        pcall(require("illuminate").pause_buf)
                    end
                    return file_is_big
                end,
            },
            incremental_selection = {
                enable = false,
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
