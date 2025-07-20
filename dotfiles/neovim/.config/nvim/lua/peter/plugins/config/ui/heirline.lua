return {
    "rebelot/heirline.nvim",
    event = { "UiEnter", "VeryLazy" },
    dependencies = {
        -- "Zeioth/heirline-components.nvim",
        {
            dir = "~/.config/nvim/plugins/heirline-components",
        },
    },
    init = function()
        vim.opt.laststatus = 2
    end,
    config = function()
        local heirline = require("heirline")
        heirline.setup({
            statusline = require("heirline-components.statusline"),
            opts = {
                colors = require("heirline-components.colors"),
            },
        })
    end,
}
