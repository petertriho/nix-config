return {
    "kristijanhusak/vim-dadbod-ui",
    dependencies = {
        { "tpope/vim-dadbod", lazy = true },
        {
            "kristijanhusak/vim-dadbod-completion",
            ft = { "sql", "mysql", "plsql" },
            lazy = true,
            config = function()
                require("cmp").setup.buffer({ sources = { { name = "vim-dadbod-completion" } } })
            end,
        },
    },
    cmd = {
        "DBUI",
        "DBUIToggle",
        "DBUIAddConnection",
        "DBUIFindBuffer",
    },
    keys = {
        { "<leader>td", "<CMD>DBUIToggle<CR>", desc = "DB" },
    },
    init = function()
        vim.g.db_ui_show_database_icon = 1
        vim.g.db_ui_use_nerd_fonts = 1
        vim.g.db_ui_save_location = os.getenv("DB_UI_SAVE_LOCATION") or vim.fn.expand("$HOME/.local/share/db_ui")
    end,
}
