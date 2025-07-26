local conditions = require("heirline.conditions")

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
        provider = function(self)
            local filename = vim.fn.fnamemodify(self.filename, ":t")
            if filename == "" then
                return "[No Name]"
            end
            return filename
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
    -- {
    --     condition = function()
    --         return not conditions.is_active()
    --     end,
    --     { ShortFileName, Navic },
    -- },
    { Space, ShortFileName, Navic },
}

return WinBar
