local conditions = require("heirline.conditions")

local Space = require("heirline-components.components.space")
local TerminalName = require("heirline-components.components.terminalname")
local FileType = require("heirline-components.components.filetype")

local FileIcon = require("heirline-components.components.fileicon")
local Navic = require("heirline-components.components.navic")

local ShortFileName = {
    init = function(self)
        self.filename = vim.api.nvim_buf_get_name(0)
        self.is_active = conditions.is_active()
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
        hl = function(self)
            if self.is_active then
                return { fg = "blue" }
            else
                return { fg = "fg" }
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
    -- {
    --     condition = function()
    --         return not conditions.is_active()
    --     end,
    --     { Space, ShortFileName, Navic },
    -- },
    { Space, ShortFileName, Navic },
}

return WinBar
