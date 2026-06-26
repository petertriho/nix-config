local filename_utils = require("heirline-components.utils.filename")

local M = {}

local buflist = {}
local bufmap = {}
local basename_paths = {}
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

local function get_bufs()
    return vim.tbl_filter(function(bufnr)
        return vim.api.nvim_get_option_value("buflisted", { buf = bufnr })
    end, vim.api.nvim_list_bufs())
end

local function clear_picker()
    clear(picker_labels)
    clear(picker_buf_labels)
end

local function redraw_tabline()
    vim.cmd.redrawtabline()
end

local function refresh(redraw)
    clear(bufmap)
    clear(basename_paths)

    local buffers = get_bufs()
    for i, bufnr in ipairs(buffers) do
        buflist[i] = bufnr
        bufmap[bufnr] = i

        local name = vim.api.nvim_buf_get_name(bufnr)
        if name ~= "" then
            local basename = vim.fn.fnamemodify(name, ":t")
            basename_paths[basename] = basename_paths[basename] or {}
            table.insert(basename_paths[basename], vim.fn.fnamemodify(name, ":~:."))
        end
    end

    for i = #buffers + 1, #buflist do
        buflist[i] = nil
    end

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
    vim.api.nvim_create_autocmd({ "VimEnter", "UIEnter", "BufAdd", "BufDelete", "BufFilePost", "TabEnter" }, {
        group = group,
        callback = schedule_refresh,
    })

    for i = 1, 9 do
        vim.keymap.set("n", "<leader>" .. i, function()
            M.switch_by_index(i)
        end, { desc = "Switch to buffer " .. i })
    end

    vim.keymap.set("n", "<leader>0", function()
        M.switch_by_index(10)
    end, { desc = "Switch to buffer 10" })

    vim.keymap.set("n", "gb", M.pick, { desc = "Pick buffer" })
end

function M.buffers()
    return buflist
end

function M.index(bufnr)
    return bufmap[bufnr]
end

function M.display_name(bufnr)
    local filename = vim.api.nvim_buf_get_name(bufnr)
    return filename_utils.get_smart_filename(filename, basename_paths)
end

function M.switch(bufnr)
    if bufnr and vim.api.nvim_buf_is_valid(bufnr) then
        vim.api.nvim_win_set_buf(0, bufnr)
    end
end

function M.switch_by_index(index)
    M.switch(buflist[index])
end

function M.close(bufnr)
    local ok, err = pcall(vim.api.nvim_buf_delete, bufnr, { force = false })
    if ok then
        redraw_tabline()
    end

    return ok, err
end

function M.is_picking()
    return show_picker
end

function M.picker_label(bufnr)
    if picker_buf_labels[bufnr] then
        return picker_buf_labels[bufnr]
    end

    local bufname = vim.api.nvim_buf_get_name(bufnr)
    bufname = vim.fn.fnamemodify(bufname, ":t")

    local label = bufname:sub(1, 1)
    local i = 2
    while picker_labels[label] do
        if i > #bufname then
            break
        end
        label = bufname:sub(i, i)
        i = i + 1
    end

    picker_labels[label] = bufnr
    picker_buf_labels[bufnr] = label
    return label
end

function M.pick()
    clear_picker()
    show_picker = true
    redraw_tabline()

    local ok, char = pcall(vim.fn.getcharstr)
    if ok then
        M.switch(picker_labels[char])
    end

    show_picker = false
    clear_picker()
    redraw_tabline()

    if not ok then
        error(char)
    end
end

return M
