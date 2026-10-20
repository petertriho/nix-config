local escape = require("heirline-components.utils.statusline").escape

local M = {}

local NO_NAME = "[No Name]"

-- basename -> relative paths of the listed buffers with that basename
local basename_paths = {}
-- bufnr -> { name = <buffer name at refresh>, full = <escaped>, smart = <escaped> }
local labels = {}

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

-- A pattern, because `vim.fs.basename()` calls `fnamemodify()`, and `smart()` runs on every render.
local function basename_of(path)
    return path:match("[^/]*$")
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

local function smart_label(name, relative)
    local basename = basename_of(name)
    local duplicate_paths = basename_paths[basename]
    if duplicate_paths and #duplicate_paths > 1 then
        return readable_unique_suffix(relative, duplicate_paths)
    end
    return basename
end

local function cached(bufnr, name)
    if bufnr == 0 then
        bufnr = vim.api.nvim_get_current_buf()
    end
    local entry = labels[bufnr]
    if entry and entry.name == name then
        return entry
    end
end

--- Recompute the labels of `buffers` (the listed buffers). Call this before the tabline redraws.
function M.refresh(buffers)
    clear(basename_paths)
    clear(labels)

    local named = {}
    for _, bufnr in ipairs(buffers) do
        local name = vim.api.nvim_buf_get_name(bufnr)
        if name ~= "" then
            local basename = basename_of(name)
            local relative = relative_path(name)
            basename_paths[basename] = basename_paths[basename] or {}
            table.insert(basename_paths[basename], relative)
            table.insert(named, { bufnr = bufnr, name = name, relative = relative })
        end
    end

    for _, buf in ipairs(named) do
        labels[buf.bufnr] = {
            name = buf.name,
            full = escape(buf.relative),
            smart = escape(smart_label(buf.name, buf.relative)),
        }
    end
end

function M.full(bufnr)
    local name = vim.api.nvim_buf_get_name(bufnr)
    if name == "" then
        return NO_NAME
    end

    local entry = cached(bufnr, name)
    if entry then
        return entry.full
    end
    return escape(relative_path(name))
end

function M.smart(bufnr)
    local name = vim.api.nvim_buf_get_name(bufnr)
    if name == "" then
        return NO_NAME
    end

    local entry = cached(bufnr, name)
    if entry then
        return entry.smart
    end
    return escape(smart_label(name, relative_path(name)))
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
