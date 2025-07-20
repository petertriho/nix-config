local conditions = require("heirline.conditions")

local StatusLineHl = function()
    if conditions.is_active() then
        return "StatusLine"
    else
        return "StatusLineNC"
    end
end

local Align = require("heirline-components.components.align")
local LeftSeparator = require("heirline-components.components.leftseparator")
local Space = require("heirline-components.components.space")

local ViMode = require("heirline-components.components.vimode")
local FileName = require("heirline-components.components.filename")
local FileNameBlock = require("heirline-components.components.filenameblock")
local Git = require("heirline-components.components.git")
local Diagnostics = require("heirline-components.components.diagnostics")
local Position = require("heirline-components.components.position")
local LspClientCount = require("heirline-components.components.lspclientscount")
local FileType = require("heirline-components.components.filetype")
local FileStats = require("heirline-components.components.filestats")
local Ruler = require("heirline-components.components.ruler")

local DefaultStatusLine = {
    -- LHS
    ViMode,
    FileNameBlock,
    Space,
    Git,
    Align,
    -- RHS
    Diagnostics,
    Space,
    Position,
    Space,
    LspClientCount,
    LeftSeparator,
    FileType,
    Space,
    FileStats,
    Ruler,
}

local WindowNumber = {
    provider = function()
        return tostring(vim.api.nvim_win_get_number(0))
    end,
}

local BgHighlight = function(component)
    return {
        hl = { bg = "bg_highlight" },
        Space,
        component,
        Space,
    }
end

local InactiveStatusLine = {
    condition = conditions.is_not_active,
    hl = { fg = "fg" },
    BgHighlight(FileType),
    Space,
    FileName,
    Align,
    BgHighlight(WindowNumber),
}

local HelpFileName = {
    provider = function()
        local buftype = vim.bo.buftype
        if buftype == "nofile" then
            return "[No File]"
        elseif buftype == "prompt" then
            return "[Prompt]"
        elseif buftype == "help" then
            return "[Help]"
        elseif buftype == "quickfix" then
            return "[Quickfix]"
        end
        local filename = vim.fn.fnamemodify(vim.api.nvim_buf_get_name(0), ":~:.")
        if filename == "" then
            return "[No Name]"
        end
        return filename
    end,
    hl = { fg = "blue" },
}

local SpecialStatusLine = {
    condition = function()
        return conditions.buffer_matches({
            buftype = { "nofile", "prompt", "help", "quickfix" },
            filetype = { "^git.*", "fugitive" },
        })
    end,
    BgHighlight(FileType),
    Space,
    HelpFileName,
    Align,
    BgHighlight(WindowNumber),
}

local TerminalName = {
    provider = function()
        local tname, _ = vim.api.nvim_buf_get_name(0):gsub(".*:", "")
        return " " .. tname
    end,
    hl = { fg = "blue", bold = true },
}

local TerminalStatusLine = {
    condition = function()
        return conditions.buffer_matches({ buftype = { "terminal" } })
    end,
    ViMode,
    Space,
    TerminalName,
    Align,
    BgHighlight(WindowNumber),
}

return {
    hl = StatusLineHl,
    fallthrough = false,
    InactiveStatusLine,
    SpecialStatusLine,
    TerminalStatusLine,
    DefaultStatusLine,
}
