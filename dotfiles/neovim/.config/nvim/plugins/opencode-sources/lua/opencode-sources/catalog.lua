local M = {}

local function scandir(root)
    local handle = vim.uv.fs_scandir(root)
    if not handle then
        return function()
            return nil
        end
    end

    return function()
        return vim.uv.fs_scandir_next(handle)
    end
end

local function relpath(root, path)
    local prefix = root:gsub("/$", "") .. "/"
    if path:sub(1, #prefix) == prefix then
        return path:sub(#prefix + 1)
    end

    return path
end

function M.strip_extension(name)
    return (name:gsub("%.[^.]+$", ""))
end

function M.list_file_basenames(root)
    local seen = {}

    for entry, entry_type in scandir(root) do
        local is_file = entry_type == "file"
        if not is_file and entry_type == "link" then
            local stat = vim.uv.fs_stat(vim.fs.joinpath(root, entry))
            is_file = stat and stat.type == "file"
        end

        if is_file then
            local basename = M.strip_extension(entry)
            if basename ~= "" then
                seen[basename] = true
            end
        end
    end

    local names = vim.tbl_keys(seen)
    table.sort(names)
    return names
end

function M.list_skill_names(root)
    local by_label = {}
    local visited = {}

    local function walk(logical_path)
        local stat = vim.uv.fs_stat(logical_path)
        if not stat or stat.type ~= "directory" then
            return
        end

        local real_path = vim.uv.fs_realpath(logical_path) or logical_path
        if visited[real_path] then
            return
        end
        visited[real_path] = true

        if vim.uv.fs_stat(vim.fs.joinpath(logical_path, "SKILL.md")) then
            local label = vim.fs.basename(logical_path)
            local current_rel = relpath(root, logical_path)
            local existing = by_label[label]
            if not existing or current_rel < existing.rel then
                by_label[label] = {
                    label = label,
                    rel = current_rel,
                }
            end
        end

        for child in scandir(logical_path) do
            local child_path = vim.fs.joinpath(logical_path, child)
            local child_stat = vim.uv.fs_stat(child_path)
            if child_stat and child_stat.type == "directory" then
                walk(child_path)
            end
        end
    end

    walk(root)

    local names = vim.tbl_map(function(item)
        return item.label
    end, vim.tbl_values(by_label))
    table.sort(names)
    return names
end

function M.match_trigger(line, cursor_col, trigger)
    local before = line:sub(1, cursor_col)
    if trigger == "/" and before:match("^/[^%s]*/") then
        return nil
    end

    local token = before:match(vim.pesc(trigger) .. "([^%s]*)$")
    if token == nil then
        return nil
    end

    local start_col = #before - #token
    local trigger_col = start_col - #trigger
    if trigger_col > 0 then
        local previous = before:sub(trigger_col, trigger_col)
        if not previous:match("%s") then
            return nil
        end
    end

    return {
        token = token,
        start_col = start_col,
        end_col = cursor_col,
    }
end

function M.make_items(names, ctx, match, kind)
    local items = {}
    local line = (ctx.cursor and ctx.cursor[1] or 1) - 1

    for _, name in ipairs(names) do
        table.insert(items, {
            label = name,
            kind = kind,
            textEdit = {
                newText = name,
                range = {
                    start = { line = line, character = match.start_col },
                    ["end"] = { line = line, character = match.end_col },
                },
            },
        })
    end

    return items
end

local RESOLVE_STRATEGIES = {
    file = function(root, label)
        for entry, entry_type in scandir(root) do
            local is_file = entry_type == "file"
            if not is_file and entry_type == "link" then
                local stat = vim.uv.fs_stat(vim.fs.joinpath(root, entry))
                is_file = stat and stat.type == "file"
            end

            if is_file then
                local basename = M.strip_extension(entry)
                if basename == label then
                    return vim.fs.joinpath(root, entry)
                end
            end
        end
        return nil
    end,

    skill = function(root, label)
        local visited = {}

        local function walk(logical_path)
            local stat = vim.uv.fs_stat(logical_path)
            if not stat or stat.type ~= "directory" then
                return nil
            end

            local real_path = vim.uv.fs_realpath(logical_path) or logical_path
            if visited[real_path] then
                return nil
            end
            visited[real_path] = true

            if vim.fs.basename(logical_path) == label then
                local skill_md = vim.fs.joinpath(logical_path, "SKILL.md")
                if vim.uv.fs_stat(skill_md) then
                    return skill_md
                end
            end

            for child in scandir(logical_path) do
                local child_path = vim.fs.joinpath(logical_path, child)
                local child_stat = vim.uv.fs_stat(child_path)
                if child_stat and child_stat.type == "directory" then
                    local result = walk(child_path)
                    if result then
                        return result
                    end
                end
            end

            return nil
        end

        return walk(root)
    end,
}

local function read_file_content(path)
    local file = io.open(path, "r")
    if not file then
        return nil
    end
    local content = file:read("*a")
    file:close()
    return content
end

function M.resolve(item, root, strategy, callback)
    local finder = RESOLVE_STRATEGIES[strategy]
    if not finder then
        callback(item)
        return
    end

    local path = finder(root, item.label)
    if not path then
        callback(item)
        return
    end

    local content = read_file_content(path)
    if content then
        item.documentation = {
            kind = "markdown",
            value = content,
        }
    end
    callback(item)
end

return M
