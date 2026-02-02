local M = {}

local function has_duplicate_basename(target_basename)
    local count = 0
    for _, buf in ipairs(vim.fn.getbufinfo({ bufloaded = 1 })) do
        if buf.name ~= "" then
            local filename = vim.fn.fnamemodify(buf.name, ":t")
            if filename == target_basename then
                count = count + 1
                if count > 1 then
                    return true
                end
            end
        end
    end
    return false
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

    local basename = vim.fn.fnamemodify(filename, ":t")
    local is_duplicate = has_duplicate_basename(basename)

    if is_duplicate then
        local relative_path = vim.fn.fnamemodify(filename, ":~:.")
        return abbreviate_path(relative_path)
    end

    return basename
end

return M
