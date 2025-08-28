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
        vim.o.showtabline = 2
        vim.cmd([[au FileType * if index(['wipe', 'delete'], &bufhidden) >= 0 | set nobuflisted | endif]])
    end,
    config = function()
        local heirline = require("heirline")
        local conditions = require("heirline.conditions")
        local filetypes = require("peter.core.filetypes")

        heirline.setup({
            statusline = require("heirline-components.statusline"),
            tabline = require("heirline-components.tabline"),
            -- winbar = require("heirline-components.winbar"),
            opts = {
                colors = require("heirline-components.colors"),
                disable_winbar_cb = function(args)
                    return conditions.buffer_matches({
                        buftype = { "nofile", "prompt", "help", "quickfix" },
                        filetype = filetypes.excludes,
                    }, args.buf)
                end,
            },
        })
    end,
}
