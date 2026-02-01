local M = {}

local function get_filename_counts()
    local filename_counts = {}
    for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
        local name = vim.api.nvim_buf_get_name(bufnr)
        if name ~= "" then
            local filename = vim.fn.fnamemodify(name, ":t")
            filename_counts[filename] = (filename_counts[filename] or 0) + 1
        end
    end
    return filename_counts
end

local function abbreviate_path(path)
    local parts = {}
    for part in path:gmatch("[^/]+") do
        table.insert(parts, part)
    end

    if #parts <= 1 then
        return path
    end

    local abbreviated = {}
    for i = 1, #parts - 1 do
        table.insert(abbreviated, parts[i]:sub(1, 1))
    end
    table.insert(abbreviated, parts[#parts])

    return table.concat(abbreviated, "/")
end

function M.get_smart_filename(filename)
    if filename == "" then
        return "[No Name]"
    end

    local filename_counts = get_filename_counts()
    local basename = vim.fn.fnamemodify(filename, ":t")
    local is_duplicate = (filename_counts[basename] or 0) > 1

    if is_duplicate then
        local relative_path = vim.fn.fnamemodify(filename, ":~:.")
        return abbreviate_path(relative_path)
    end

    return basename
end

return M
