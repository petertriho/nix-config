return {
    "rebelot/heirline.nvim",
    event = { "UiEnter", "VeryLazy" },
    keys = {

        { "<C-n>", "<CMD>bnext<CR>" },
        { "<C-p>", "<CMD>bprev<CR>" },
    },
    dependencies = {
        -- "Zeioth/heirline-components.nvim",
        {
            dir = "~/.config/nvim/plugins/heirline-components",
        },
    },
    init = function()
        vim.opt.laststatus = 2
        -- vim.o.showtabline = 2
        -- vim.cmd([[au FileType * if index(['wipe', 'delete'], &bufhidden) >= 0 | set nobuflisted | endif]])
    end,
    config = function()
        local heirline = require("heirline")
        heirline.setup({
            statusline = require("heirline-components.statusline"),
            -- tabline = require("heirline-components.tabline"),
            opts = {
                colors = require("heirline-components.colors"),
            },
        })
    end,
}
