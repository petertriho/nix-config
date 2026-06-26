local M = {}

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

local function duplicate_paths_for_basename(target_basename)
    local paths = {}
    for _, buf in ipairs(vim.fn.getbufinfo({ bufloaded = 1 })) do
        if buf.name ~= "" then
            local filename = vim.fn.fnamemodify(buf.name, ":t")
            if filename == target_basename then
                table.insert(paths, relative_path(buf.name))
            end
        end
    end
    return paths
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

function M.get_smart_filename(filename, basename_paths)
    if filename == "" then
        return "[No Name]"
    end

    local basename = vim.fn.fnamemodify(filename, ":t")
    local duplicate_paths = basename_paths and basename_paths[basename] or duplicate_paths_for_basename(basename)

    if #duplicate_paths > 1 then
        return readable_unique_suffix(relative_path(filename), duplicate_paths)
    end

    return basename
end

return M
