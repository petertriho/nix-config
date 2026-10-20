local conditions = require("heirline.conditions")

local filename = require("heirline-components.utils.filename")
local Space = require("heirline-components.components.space")
local TerminalName = require("heirline-components.components.terminalname")
local FileType = require("heirline-components.components.filetype")

local FileIcon = require("heirline-components.components.fileicon")
local Navic = require("heirline-components.components.navic")

local ShortFileName = {
    init = function(self)
        self.filename = vim.api.nvim_buf_get_name(0)
    end,
    FileIcon,
    {
        provider = function()
            return filename.smart(0)
        end,
        -- Inactive windows keep the WinBarNC colors.
        hl = function()
            if conditions.is_active() then
                return { fg = "blue" }
            end
        end,
    },
}

local WinBar = {
    fallthrough = false,
    {
        condition = function()
            return conditions.buffer_matches({ buftype = { "terminal" } })
        end,
        {
            FileType,
            Space,
            TerminalName,
        },
    },
    { Space, ShortFileName, Navic },
}

return WinBar
