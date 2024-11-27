return {
    "nvim-treesitter/nvim-treesitter",
    cmd = {
        "TSUpdate",
        "TSUpdateSync",
    },
    event = { "User LazyLoadFile", "VeryLazy" },
    build = ":TSUpdateSync",
    config = function()
        local utils = require("peter.core.utils")

        require("nvim-treesitter.configs").setup({
            ensure_installed = {
                "bash",
                -- "comment",
                "css",
                "diff",
                "dockerfile",
                "fish",
                "git_config",
                "git_rebase",
                "gitattributes",
                "gitcommit",
                "gitignore",
                "go",
                "graphql",
                "hcl",
                "html",
                "java",
                "javascript",
                "json",
                "jsonc",
                "lua",
                "markdown",
                "markdown_inline",
                "nix",
                "python",
                "regex",
                "rust",
                "scss",
                "sql",
                "svelte",
                "terraform",
                "tmux",
                "todotxt",
                "toml",
                "tsx",
                "typescript",
                "vim",
                "vimdoc",
                "yaml",
            },
            sync_install = true,
            highlight = {
                enable = true,
                use_languagetree = false,
                disable = function(lang, bufnr)
                    local file_is_big = utils.file_is_big(bufnr)
                    if file_is_big then
                        -- NOTE: need to call this again because ts re-enables syntax
                        utils.disable_features(bufnr)
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
