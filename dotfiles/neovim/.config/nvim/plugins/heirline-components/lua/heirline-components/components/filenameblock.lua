local Space = require("heirline-components.components.space")
local FileName = require("heirline-components.components.filename")

return {
    hl = { bg = "bg_highlight" },
    Space,
    {

        hl = function()
            return { fg = vim.g.heirline_mode_color }
        end,
        FileName,
    },
    {
        condition = function()
            return vim.bo.modified
        end,
        provider = " ●",
        hl = { fg = "green" },
    },
    {
        condition = function()
            return not vim.bo.modifiable or vim.bo.readonly
        end,
        provider = " ",
        hl = { fg = "orange" },
    },
    Space,
    { provider = "%<" }, -- cut here when there's not enough space
}
