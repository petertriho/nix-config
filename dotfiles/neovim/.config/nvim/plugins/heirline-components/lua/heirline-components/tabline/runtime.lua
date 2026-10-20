local filename = require("heirline-components.utils.filename")

local M = {}

-- Picker labels when no character of the file name is free.
local PICKER_FALLBACK_LABELS = "asdfghjklqwertyuiopzxcvbnm1234567890ASDFGHJKLQWERTYUIOPZXCVBNM"

local buflist = {}
local bufmap = {}
local picker_labels = {}
local picker_buf_labels = {}

local is_setup = false
local refresh_scheduled = false
local show_picker = false

local function clear(tbl)
    for k in pairs(tbl) do
        tbl[k] = nil
    end
end

local function listed_bufs()
    return vim.tbl_filter(function(bufnr)
        return vim.bo[bufnr].buflisted
    end, vim.api.nvim_list_bufs())
end

local function redraw_tabline()
    vim.cmd.redrawtabline()
end

local function refresh(redraw)
    clear(bufmap)

    local buffers = listed_bufs()
    for i, bufnr in ipairs(buffers) do
        buflist[i] = bufnr
        bufmap[bufnr] = i
    end

    for i = #buffers + 1, #buflist do
        buflist[i] = nil
    end

    -- The labels must be current before the redraw below renders them.
    filename.refresh(buffers)

    if redraw then
        redraw_tabline()
    end
end

local function schedule_refresh()
    if refresh_scheduled then
        return
    end

    refresh_scheduled = true
    vim.schedule(function()
        refresh_scheduled = false
        refresh(true)
    end)
end

function M.setup()
    if is_setup then
        return
    end

    is_setup = true
    refresh(false)

    local group = vim.api.nvim_create_augroup("heirline_components_tabline_runtime", { clear = true })
    vim.api.nvim_create_autocmd(
        { "VimEnter", "UIEnter", "BufAdd", "BufDelete", "BufFilePost", "TabEnter", "DirChanged" },
        {
            group = group,
            callback = schedule_refresh,
        }
    )
    vim.api.nvim_create_autocmd("OptionSet", {
        group = group,
        pattern = "buflisted",
        callback = schedule_refresh,
    })
end

function M.buffers()
    return buflist
end

function M.index(bufnr)
    return bufmap[bufnr]
end

function M.switch(bufnr)
    if bufnr and vim.api.nvim_buf_is_valid(bufnr) then
        vim.api.nvim_win_set_buf(0, bufnr)
    end
end

function M.switch_by_index(index)
    M.switch(buflist[index])
end

local function replacement_buf(win, bufnr, fallback)
    local alternate = vim.api.nvim_win_call(win, function()
        return vim.fn.bufnr("#")
    end)
    if alternate > 0 and alternate ~= bufnr and vim.bo[alternate].buflisted then
        return alternate
    end
    return fallback()
end

-- Like `:bdelete`, but each window that shows the buffer stays open and shows another buffer.
local function delete_keep_layout(bufnr)
    if vim.bo[bufnr].modified then
        return false, ("Buffer %d has unsaved changes"):format(bufnr)
    end

    local other
    local function fallback()
        if not other then
            local recent
            for _, info in ipairs(vim.fn.getbufinfo({ buflisted = 1 })) do
                if info.bufnr ~= bufnr and (not recent or info.lastused > recent.lastused) then
                    recent = info
                end
            end
            other = recent and recent.bufnr or vim.api.nvim_create_buf(true, false)
        end
        return other
    end

    for _, win in ipairs(vim.fn.win_findbuf(bufnr)) do
        local ok, err = pcall(vim.api.nvim_win_set_buf, win, replacement_buf(win, bufnr, fallback))
        if not ok then
            return false, err
        end
    end

    return pcall(vim.cmd.bdelete, bufnr)
end

function M.close(bufnr)
    if not vim.api.nvim_buf_is_valid(bufnr) then
        return false
    end

    local ok, err
    local has_snacks, snacks = pcall(require, "snacks")
    if has_snacks then
        -- Snacks asks before it closes a modified buffer.
        ok, err = pcall(snacks.bufdelete.delete, { buf = bufnr })
    else
        ok, err = delete_keep_layout(bufnr)
    end

    if not ok then
        vim.notify(("Cannot close buffer: %s"):format(err), vim.log.levels.WARN)
    end
    return ok, err
end

function M.is_picking()
    return show_picker
end

local function assign_picker_label(bufnr, candidates)
    for char in candidates:gmatch(".") do
        if not picker_labels[char] then
            picker_labels[char] = bufnr
            picker_buf_labels[bufnr] = char
            return
        end
    end
end

local function assign_picker_labels()
    clear(picker_labels)
    clear(picker_buf_labels)

    local pending = {}
    for _, bufnr in ipairs(buflist) do
        local name = vim.fs.basename(vim.api.nvim_buf_get_name(bufnr)):lower():gsub("[^%w]", "")
        if name ~= "" then
            assign_picker_label(bufnr, name)
        end
        if not picker_buf_labels[bufnr] then
            table.insert(pending, bufnr)
        end
    end

    for _, bufnr in ipairs(pending) do
        assign_picker_label(bufnr, PICKER_FALLBACK_LABELS)
    end
end

function M.picker_label(bufnr)
    return picker_buf_labels[bufnr]
end

function M.pick()
    assign_picker_labels()
    show_picker = true
    redraw_tabline()

    local ok, char = pcall(vim.fn.getcharstr)
    if ok then
        M.switch(picker_labels[char])
    end

    show_picker = false
    clear(picker_labels)
    clear(picker_buf_labels)
    redraw_tabline()

    if not ok then
        error(char)
    end
end

return M
