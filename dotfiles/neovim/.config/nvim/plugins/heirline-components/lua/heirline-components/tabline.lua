local utils = require("heirline.utils")

local buflist_cache = {}
local bufmap_cache = {}

local get_bufs = function()
    return vim.tbl_filter(function(bufnr)
        return vim.api.nvim_get_option_value("buflisted", { buf = bufnr })
    end, vim.api.nvim_list_bufs())
end

vim.api.nvim_create_autocmd({ "VimEnter", "UIEnter", "BufAdd", "BufDelete", "TabEnter" }, {
    callback = function()
        vim.schedule(function()
            for k in pairs(bufmap_cache) do
                bufmap_cache[k] = nil
            end

            local buffers = get_bufs()
            for i, v in ipairs(buffers) do
                buflist_cache[i] = v
                bufmap_cache[v] = i
            end

            for i = #buffers + 1, #buflist_cache do
                buflist_cache[i] = nil
            end
            --
            -- if #buflist_cache > 1 then
            --     vim.o.showtabline = 2
            -- elseif vim.o.showtabline ~= 1 then
            --     vim.o.showtabline = 1
            -- end
        end)
    end,
})

local function switch_to_buffer(index)
    local bufnr = buflist_cache[index]
    if bufnr and vim.api.nvim_buf_is_valid(bufnr) then
        vim.api.nvim_win_set_buf(0, bufnr)
    end
end

for i = 1, 9 do
    vim.keymap.set("n", "<leader>" .. i, function()
        switch_to_buffer(i)
    end, { desc = "Switch to buffer " .. i })
end

vim.keymap.set("n", "<leader>0", function()
    switch_to_buffer(10)
end, { desc = "Switch to buffer 10" })

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
        return tostring(bufmap_cache[self.bufnr]) .. ". "
    end,
    hl = "Comment",
}

local FileName = {
    init = function(self)
        self.filename = vim.api.nvim_buf_get_name(self.bufnr)
    end,
    provider = function(self)
        return require("heirline-components.utils.filename").get_smart_filename(self.filename)
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
                    vim.api.nvim_buf_delete(minwid, { force = false })
                end)
            else
                vim.api.nvim_win_set_buf(0, minwid)
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
                    vim.api.nvim_buf_delete(minwid, { force = false })
                    vim.cmd.redrawtabline()
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
        return self._show_picker
    end,
    init = function(self)
        local bufname = vim.api.nvim_buf_get_name(self.bufnr)
        bufname = vim.fn.fnamemodify(bufname, ":t")
        local label = bufname:sub(1, 1)
        local i = 2
        while self._picker_labels[label] do
            if i > #bufname then
                break
            end
            label = bufname:sub(i, i)
            i = i + 1
        end
        self._picker_labels[label] = self.bufnr
        self.label = label
    end,
    provider = function(self)
        return " " .. self.label .. " "
    end,
    hl = { fg = "red", bold = true },
}

vim.keymap.set("n", "gb", function()
    local tabline = require("heirline").tabline
    local buflist = tabline._buflist[1]
    buflist._picker_labels = {}
    buflist._show_picker = true
    vim.cmd.redrawtabline()
    local char = vim.fn.getcharstr()
    local bufnr = buflist._picker_labels[char]
    if bufnr then
        vim.api.nvim_win_set_buf(0, bufnr)
    end
    buflist._show_picker = false
    vim.cmd.redrawtabline()
end)

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
        return buflist_cache
    end,
    false
)

local TabPage = {
    provider = function(self)
        return "%" .. self.tabnr .. "T " .. self.tabpage .. " %T"
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
    DiffViewFiles = "DIFFVIEW",
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
