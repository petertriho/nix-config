local utils = require("heirline.utils")
local runtime = require("heirline-components.tabline.runtime")
local filename = require("heirline-components.utils.filename")

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

-- While picking, the picker label takes the place of the index, padded to the same width.
local BufIndex = {
    init = function(self)
        self.index_text = tostring(runtime.index(self.bufnr)) .. ". "
        self.picker_label = runtime.is_picking() and runtime.picker_label(self.bufnr)
    end,
    {
        condition = function(self)
            return not self.picker_label
        end,
        provider = function(self)
            return self.index_text
        end,
        hl = "Comment",
    },
    {
        condition = function(self)
            return self.picker_label
        end,
        provider = function(self)
            return self.picker_label .. string.rep(" ", #self.index_text - 1)
        end,
        hl = { fg = "red", bold = true },
    },
}

local FileName = {
    provider = function(self)
        return filename.smart(self.bufnr)
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
    init = function(self)
        self.filename = vim.api.nvim_buf_get_name(self.bufnr)
    end,
    hl = function(self)
        if self.is_active then
            return { fg = "tabline_sel_fg" }
        else
            return { fg = "tabline_fg" }
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

local BufferBlock = {
    hl = function(self)
        if self.is_active then
            return { bg = "tabline_sel_bg" }
        else
            return { bg = "tabline_bg" }
        end
    end,
    { ActiveIndicator, Space, FileNameBlock, Space, FileFlags, BufferCloseButton },
}

local BufferLine = utils.make_buflist(
    BufferBlock,
    { provider = " ", hl = { fg = "gray" } },
    { provider = " ", hl = { fg = "gray" } },
    runtime.buffers,
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
        local title = SIDEBAR_TITLES[vim.bo[vim.api.nvim_win_get_buf(win)].filetype]
        if title then
            self.winid = win
            self.title = title
            return true
        end
        return false
    end,
    provider = function(self)
        -- Cover the sidebar and its vertical separator, so the buffer list starts above the next window.
        local width = vim.api.nvim_win_get_width(self.winid)
        if width < vim.o.columns then
            width = width + 1
        end
        local title = self.title:sub(1, width)
        local left = math.floor((width - #title) / 2)
        return string.rep(" ", left) .. title .. string.rep(" ", width - #title - left)
    end,
    hl = { fg = "blue", bg = "tabline_bg" },
}

local TabLine = {
    TabLineOffset,
    BufferLine,
    TabPages,
}

return TabLine
