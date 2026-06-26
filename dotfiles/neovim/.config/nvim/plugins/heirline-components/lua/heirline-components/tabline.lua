local utils = require("heirline.utils")
local runtime = require("heirline-components.tabline.runtime")

local FileIcon = require("heirline-components.components.fileicon")
local Space = require("heirline-components.components.space")

local ActiveIndicator = {
    provider = "▎",
    hl = function(self)
        if self.is_active then
            return { fg = "blue" }
        else
            return { fg = "tabline_bg" }
        end
    end,
}

local LeftSeparator = {
    provider = "▌",
    hl = { fg = "tabline_bg" },
}

local RightSeparator = {
    provider = "▐",
    hl = { fg = "tabline_bg" },
}

local Bufnr = {
    provider = function(self)
        return tostring(self.bufnr) .. ". "
    end,
    hl = "Comment",
}

local BufIndex = {
    provider = function(self)
        return tostring(runtime.index(self.bufnr)) .. ". "
    end,
    hl = "Comment",
}

local FileName = {
    provider = function(self)
        return runtime.display_name(self.bufnr)
    end,
    hl = function(self)
        return { bold = self.is_active or self.is_visible }
    end,
}

local FileFlags = {
    {
        condition = function(self)
            return vim.api.nvim_get_option_value("modified", { buf = self.bufnr })
        end,
        provider = " ● ",
        hl = { fg = "green" },
    },
    {
        condition = function(self)
            return not vim.api.nvim_get_option_value("modifiable", { buf = self.bufnr })
                or vim.api.nvim_get_option_value("readonly", { buf = self.bufnr })
        end,
        provider = function(self)
            if vim.api.nvim_get_option_value("buftype", { buf = self.bufnr }) == "terminal" then
                return "  "
            else
                return "  "
            end
        end,
        hl = { fg = "orange" },
    },
}

local FileNameBlock = {
    hl = function(self)
        if self.is_active then
            return {
                fg = "tabline_sel_fg",
                bg = "tabline_sel_bg",
            }
        else
            return { fg = "tabline_fg", bg = "tabline_bg" }
        end
    end,
    on_click = {
        callback = function(_, minwid, _, button)
            if button == "m" then
                vim.schedule(function()
                    runtime.close(minwid)
                end)
            else
                runtime.switch(minwid)
            end
        end,
        minwid = function(self)
            return self.bufnr
        end,
        name = "heirline_tabline_buffer_callback",
    },
    BufIndex,
    FileIcon,
    FileName,
}

local BufferCloseButton = {
    condition = function(self)
        return not vim.api.nvim_get_option_value("modified", { buf = self.bufnr })
    end,
    Space,
    {
        provider = "󰅖",
        hl = { fg = "gray" },
        on_click = {
            callback = function(_, minwid)
                vim.schedule(function()
                    runtime.close(minwid)
                end)
            end,
            minwid = function(self)
                return self.bufnr
            end,
            name = "heirline_tabline_close_buffer_callback",
        },
    },
    Space,
}

local BufferPicker = {
    condition = function(self)
        return runtime.is_picking()
    end,
    init = function(self)
        self.label = runtime.picker_label(self.bufnr)
    end,
    provider = function(self)
        return " " .. self.label .. " "
    end,
    hl = { fg = "red", bold = true },
}

local BufferBlock = {
    hl = function(self)
        if self.is_active then
            return { bg = "tabline_sel_bg" }
        else
            return { bg = "tabline_bg" }
        end
    end,
    { ActiveIndicator, Space, FileNameBlock, Space, FileFlags, BufferCloseButton, BufferPicker },
}

local BufferLine = utils.make_buflist(
    BufferBlock,
    { provider = " ", hl = { fg = "gray" } },
    { provider = " ", hl = { fg = "gray" } },
    function()
        return runtime.buffers()
    end,
    false
)

local TabPage = {
    provider = function(self)
        return "%" .. self.tabnr .. "T " .. self.tabnr .. " %T"
    end,
    hl = function(self)
        if not self.is_active then
            return "TabLine"
        else
            return "TabLineSel"
        end
    end,
}

local TabPageClose = {
    provider = "%999X 󰅖 %X",
    hl = "TabLine",
}

local TabPages = {
    condition = function()
        return #vim.api.nvim_list_tabpages() >= 2
    end,
    { provider = "%=" },
    utils.make_tablist(TabPage),
    TabPageClose,
}

local SIDEBAR_TITLES = {
    Fyler = "EXPLORER",
    NvimTree = "EXPLORER",
    ["neo-tree"] = "EXPLORER",
    snacks_layout_box = "EXPLORER",
    undotree = "UNDOTREE",
}

local TabLineOffset = {
    condition = function(self)
        local win = vim.api.nvim_tabpage_list_wins(0)[1]
        local bufnr = vim.api.nvim_win_get_buf(win)
        self.winid = win

        local filetype = vim.bo[bufnr].filetype
        local title = SIDEBAR_TITLES[filetype]

        if title then
            self.title = title
            return true
        end
    end,
    provider = function(self)
        local title = self.title
        local width = vim.api.nvim_win_get_width(self.winid)
        local pad = math.ceil((width - #title) / 2)
        return string.rep(" ", pad) .. title .. string.rep(" ", pad)
    end,
    hl = function(self)
        return { fg = "blue", bg = "tabline_bg" }
    end,
}

local TabLine = {
    TabLineOffset,
    BufferLine,
    TabPages,
}

return TabLine
