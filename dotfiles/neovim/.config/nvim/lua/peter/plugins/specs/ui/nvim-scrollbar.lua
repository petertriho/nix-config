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
            exclude = {
                filetypes = require("peter.core.filetypes").excludes,
            },
            providers = {
                mini_diff = true,
                -- cursor = { minimap = false },
            },
            scrollbar = {
                placement = { anchor = "NW", gutter = "outer" },
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
                },
            },
            minimap = {
                enabled = false,
                width = 5,
                blend = 50,
            },
        })
    end,
}
