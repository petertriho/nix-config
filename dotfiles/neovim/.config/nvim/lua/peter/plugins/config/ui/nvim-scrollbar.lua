return {
    "petertriho/nvim-scrollbar",
    event = "User LazyLoadFile",
    config = function()
        local colors = require("peter.plugins.colors")

        require("scrollbar").setup({
            folds = false,
            handle = {
                blend = 10,
            },
            marks = {
                Search = { color = colors.orange },
                GitAdd = { text = "│" },
                GitChange = { text = "│" },
                GitDelete = { text = "│" },
            },
            excluded_filetypes = require("peter.plugins.filetypes").excludes,
        })
    end,
}
