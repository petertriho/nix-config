return {
    "petertriho/nvim-scrollbar",
    -- dir = "~/Projects/nvim-scrollbar",
    branch = "refactor/v2",
    event = "User LazyLoadFile",
    init = function()
        vim.o.signcolumn = "no"
    end,
    config = function()
        require("scrollbar").setup({
            float = { placement = { anchor = "NW", gutter = "avoid", gutter_position = "outer" } },
            layout = {
                direction = "auto",
                columns = {
                    { "track", "thumb", "marks" },
                },
            },
            marks = {
                GitAdd = { text = "│" },
                GitChange = { text = "│" },
                GitDelete = { text = "│" },
                MiniDiffAdd = { text = "│" },
                MiniDiffChange = { text = "│" },
                MiniDiffDelete = { text = "│" },
                Search = { highlight = "ScrollbarSearch" }, -- TODO: do not override if already configured
            },
            excluded_filetypes = require("peter.core.filetypes").excludes,
            providers = {
                mini_diff = true,
                cursor = false,
            },
        })
    end,
}
