local M = {}

local basename_paths = {}
local is_setup = false
local refresh_scheduled = false

local function clear(tbl)
    for k in pairs(tbl) do
        tbl[k] = nil
    end
end

local function path_parts(path)
    local parts = {}
    for part in path:gmatch("[^/]+") do
        table.insert(parts, part)
    end
    return parts
end

local function relative_path(path)
    return vim.fn.fnamemodify(path, ":~:.")
end

local function path_suffix(parts, length)
    local suffix = {}
    for i = math.max(#parts - length + 1, 1), #parts do
        table.insert(suffix, parts[i])
    end
    return table.concat(suffix, "/")
end

local function has_meaningful_parent(parts, length)
    local start = math.max(#parts - length + 1, 1)
    for i = start, #parts - 1 do
        if #parts[i] > 1 then
            return true
        end
    end
    return false
end

local function readable_unique_suffix(path, duplicate_paths)
    local parts = path_parts(path)
    if #parts <= 1 then
        return path
    end

    local other_paths = {}
    for _, duplicate_path in ipairs(duplicate_paths) do
        if duplicate_path ~= path then
            table.insert(other_paths, path_parts(duplicate_path))
        end
    end

    for length = 2, #parts do
        local candidate = path_suffix(parts, length)
        local unique = has_meaningful_parent(parts, length)
        for _, other_parts in ipairs(other_paths) do
            if path_suffix(other_parts, length) == candidate then
                unique = false
                break
            end
        end

        if unique then
            return candidate
        end
    end

    return path
end

local function buf_name(bufnr)
    return vim.api.nvim_buf_get_name(bufnr)
end

local function listed_bufs()
    return vim.tbl_filter(function(bufnr)
        return vim.api.nvim_get_option_value("buflisted", { buf = bufnr })
    end, vim.api.nvim_list_bufs())
end

local function refresh()
    clear(basename_paths)
    for _, bufnr in ipairs(listed_bufs()) do
        local name = vim.api.nvim_buf_get_name(bufnr)
        if name ~= "" then
            local basename = vim.fn.fnamemodify(name, ":t")
            basename_paths[basename] = basename_paths[basename] or {}
            table.insert(basename_paths[basename], relative_path(name))
        end
    end
end

local function schedule_refresh()
    if refresh_scheduled then
        return
    end

    refresh_scheduled = true
    vim.schedule(function()
        refresh_scheduled = false
        refresh()
    end)
end

function M.setup()
    if is_setup then
        return
    end

    is_setup = true
    refresh()

    local group = vim.api.nvim_create_augroup("heirline_components_filename", { clear = true })
    vim.api.nvim_create_autocmd({ "VimEnter", "UIEnter", "BufAdd", "BufDelete", "BufFilePost", "TabEnter" }, {
        group = group,
        callback = schedule_refresh,
    })
end

function M.full(bufnr)
    local path = relative_path(buf_name(bufnr))
    if path == "" then
        return "[No Name]"
    end
    return path
end

function M.basename(bufnr)
    local name = vim.fn.fnamemodify(buf_name(bufnr), ":t")
    if name == "" then
        return "[No Name]"
    end
    return name
end

function M.smart(bufnr)
    local name = buf_name(bufnr)
    if name == "" then
        return "[No Name]"
    end

    local basename = vim.fn.fnamemodify(name, ":t")
    local duplicate_paths = basename_paths[basename] or {}
    if #duplicate_paths > 1 then
        return readable_unique_suffix(relative_path(name), duplicate_paths)
    end

    return basename
end

function M.short(bufnr)
    return M.smart(bufnr)
end

function M.label(bufnr)
    local buftype = vim.bo[bufnr].buftype
    if buftype == "nofile" then
        return "[No File]"
    elseif buftype == "prompt" then
        return "[Prompt]"
    elseif buftype == "help" then
        return "[Help]"
    elseif buftype == "quickfix" then
        return "[Quickfix]"
    end
    return M.full(bufnr)
end

return M
