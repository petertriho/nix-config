local conditions = require("heirline.conditions")
local filename = require("heirline-components.utils.filename")
local mode = require("heirline-components.statusline.mode")

local Align = require("heirline-components.components.align")
local Diagnostics = require("heirline-components.components.diagnostics")
local FileName = require("heirline-components.components.filename")
local FileNameBlock = require("heirline-components.components.filenameblock")
local FileStats = require("heirline-components.components.filestats")
local FileType = require("heirline-components.components.filetype")
local Git = require("heirline-components.components.git")
local LspClientCount = require("heirline-components.components.lspclientscount")
local MacroRecorder = require("heirline-components.components.macrorecorder")
local Position = require("heirline-components.components.position")
local RightAngle = require("heirline-components.components.rightangle")
local Ruler = require("heirline-components.components.ruler")
local Space = require("heirline-components.components.space")
local TerminalName = require("heirline-components.components.terminalname")
local ViMode = require("heirline-components.components.vimode")

local StatusLineHl = function()
    if conditions.is_active() then
        return "StatusLine"
    else
        return "StatusLineNC"
    end
end

-- Optional components carry their own leading separator, so a hidden component leaves no gap.
local DefaultStatusLine = {
    -- LHS
    ViMode,
    FileNameBlock,
    Git,
    Align,
    -- RHS
    Diagnostics,
    Position,
    LspClientCount,
    {
        condition = FileType.condition,
        RightAngle,
        FileType,
    },
    Space,
    FileStats,
    {
        fallthrough = false,
        MacroRecorder,
        Ruler,
    },
}

local WindowNumber = {
    provider = function()
        return tostring(vim.api.nvim_win_get_number(0))
    end,
}

local BgHighlight = function(component)
    return {
        condition = component.condition,
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
        return filename.label(0)
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
    -- Children read `self.mode` and `self.mode_color` (a color name).
    init = function(self)
        self.mode = vim.fn.mode(1)
        self.mode_color = mode.color(self.mode)
    end,
    hl = StatusLineHl,
    fallthrough = false,
    InactiveStatusLine,
    SpecialStatusLine,
    TerminalStatusLine,
    DefaultStatusLine,
}
