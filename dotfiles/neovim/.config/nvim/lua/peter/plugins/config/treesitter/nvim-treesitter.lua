return {
    "nvim-treesitter/nvim-treesitter",
    branch = "main",
    cmd = {
        "TSUpdate",
        "TSUpdateSync",
    },
    event = { "User LazyLoadFile", "VeryLazy" },
    build = ":TSUpdate",
    dependencies = {
        {
            dir = "~/.config/nvim/plugins/incremental-selection",
            opts = {
                keymaps = {
                    init_selection = false,
                    node_incremental = "v",
                    node_decremental = "V",
                    scope_incremental = false,
                },
            },
        },
    },
    init = function()
        vim.api.nvim_create_user_command("TSUpdateSync", function()
            require("nvim-treesitter").update():wait(600000) -- 10 mins
        end, {})
    end,
    config = function()
        local ensure_installed = {
            -- "comment",
            "markdown_inline",
            "regex",
            "vimdoc",
            unpack(require("peter.core.filetypes").treesitter),
        }

        local ok, nvim_treesitter = pcall(require, "nvim-treesitter")
        if not ok then
            return
        end
        nvim_treesitter.install(ensure_installed)

        vim.api.nvim_create_autocmd({ "Filetype" }, {
            callback = function(event)
                local ft = vim.bo[event.buf].ft
                if require("peter.core.utils").is_ft("excludes", ft) then
                    return
                end

                local lang = vim.treesitter.language.get_lang(ft)
                pcall(vim.treesitter.start, event.buf, lang)
                vim.bo.indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
                vim.opt_local.foldmethod = "expr"
                vim.opt_local.foldexpr = "nvim_treesitter#foldexpr()"
                vim.opt_local.foldminlines = 1
                vim.opt_local.foldnestmax = 3
                vim.opt_local.foldlevel = 3
                vim.opt_local.foldtext =
                    "substitute(getline(v:foldstart),'\\t',repeat(' ',&tabstop),'g').'...'.trim(getline(v:foldend)).' ('.(v:foldend-v:foldstart+1).' lines)'"
            end,
        })

        vim.api.nvim_exec_autocmds("User", { pattern = "LoadedNvimTreesitter" })
    end,
}
