local M = {}

local uv = vim.uv

local DEFAULT_CACHE_TTL_MS = 60000
local DEFAULT_DOC_MAX_BYTES = 65536
local TRUNCATION_NOTE = "\n\n_Documentation truncated for completion preview._"

local caches = {}

local function now_ms()
    return uv.hrtime() / 1000000
end

local function joinpath(root, name)
    if root:sub(-1) == "/" then
        return root .. name
    end
    return root .. "/" .. name
end

local function basename(path)
    local trimmed = path:gsub("/+$", "")
    return trimmed:match("([^/]+)$") or trimmed
end

local function relpath(root, path)
    local prefix = root:gsub("/$", "") .. "/"
    if path:sub(1, #prefix) == prefix then
        return path:sub(#prefix + 1)
    end

    return path
end

local function sorted_labels(path_by_label)
    local labels = {}
    for label in pairs(path_by_label) do
        table.insert(labels, label)
    end
    table.sort(labels)
    return labels
end

local function normalize_opts(opts)
    opts = opts or {}

    return {
        cache_ttl_ms = tonumber(opts.cache_ttl_ms) or DEFAULT_CACHE_TTL_MS,
        doc_max_bytes = tonumber(opts.doc_max_bytes) or DEFAULT_DOC_MAX_BYTES,
    }
end

local function cache_key(root, strategy)
    return strategy .. "\0" .. root
end

local function get_cache(root, strategy)
    local key = cache_key(root, strategy)
    local cache = caches[key]
    if cache then
        return cache
    end

    cache = {
        root = root,
        strategy = strategy,
        labels = nil,
        path_by_label = {},
        doc_by_path = {},
        scanned_at = 0,
        refreshing = false,
        generation = 0,
        waiters = {},
    }
    caches[key] = cache
    return cache
end

local function finish_scan(path_by_label)
    return {
        labels = sorted_labels(path_by_label),
        path_by_label = path_by_label,
    }
end

local function scan_file_root(root, done)
    uv.fs_scandir(root, function(_, handle)
        local pending = 1
        local path_by_label = {}

        local function add_file(entry)
            local label = M.strip_extension(entry)
            if label == "" then
                return
            end

            local path = joinpath(root, entry)
            if not path_by_label[label] or path < path_by_label[label] then
                path_by_label[label] = path
            end
        end

        local function complete_one()
            pending = pending - 1
            if pending == 0 then
                done(finish_scan(path_by_label))
            end
        end

        if handle then
            while true do
                local entry, entry_type = uv.fs_scandir_next(handle)
                if not entry then
                    break
                end

                if entry_type == "file" then
                    add_file(entry)
                elseif entry_type == "link" then
                    pending = pending + 1
                    local path = joinpath(root, entry)
                    uv.fs_stat(path, function(_, stat)
                        if stat and stat.type == "file" then
                            add_file(entry)
                        end
                        complete_one()
                    end)
                end
            end
        end

        complete_one()
    end)
end

local function scan_skill_root(root, done)
    local pending = 0
    local completed = false
    local visited = {}
    local path_by_label = {}
    local rel_by_label = {}

    local function maybe_done()
        if pending == 0 and not completed then
            completed = true
            done(finish_scan(path_by_label))
        end
    end

    local function complete_one()
        pending = pending - 1
        maybe_done()
    end

    local function record_skill(logical_path)
        local label = basename(logical_path)
        local current_rel = relpath(root, logical_path)
        local existing_rel = rel_by_label[label]
        if not existing_rel or current_rel < existing_rel then
            rel_by_label[label] = current_rel
            path_by_label[label] = joinpath(logical_path, "SKILL.md")
        end
    end

    local function walk(logical_path)
        pending = pending + 1
        uv.fs_stat(logical_path, function(_, stat)
            if not stat or stat.type ~= "directory" then
                complete_one()
                return
            end

            uv.fs_realpath(logical_path, function(_, real_path)
                real_path = real_path or logical_path
                if visited[real_path] then
                    complete_one()
                    return
                end
                visited[real_path] = true

                pending = pending + 1
                uv.fs_stat(joinpath(logical_path, "SKILL.md"), function(_, skill_stat)
                    if skill_stat and skill_stat.type == "file" then
                        record_skill(logical_path)
                    end
                    complete_one()
                end)

                pending = pending + 1
                uv.fs_scandir(logical_path, function(_, handle)
                    if handle then
                        while true do
                            local child, child_type = uv.fs_scandir_next(handle)
                            if not child then
                                break
                            end

                            if child_type == "directory" or child_type == "link" then
                                local child_path = joinpath(logical_path, child)
                                pending = pending + 1
                                uv.fs_stat(child_path, function(_, child_stat)
                                    if child_stat and child_stat.type == "directory" then
                                        walk(child_path)
                                    end
                                    complete_one()
                                end)
                            end
                        end
                    end

                    complete_one()
                end)

                complete_one()
            end)
        end)
    end

    walk(root)
end

local SCANNERS = {
    file = scan_file_root,
    skill = scan_skill_root,
}

local function complete_refresh(cache, generation, result)
    vim.schedule(function()
        if cache.generation ~= generation then
            return
        end

        cache.refreshing = false
        cache.labels = result.labels
        cache.path_by_label = result.path_by_label
        cache.doc_by_path = {}
        cache.scanned_at = now_ms()

        local waiters = cache.waiters
        cache.waiters = {}
        for _, waiter in ipairs(waiters) do
            waiter(cache)
        end
    end)
end

local function refresh_cache(cache)
    if cache.refreshing then
        return
    end

    local scanner = SCANNERS[cache.strategy]
    if not scanner then
        return
    end

    cache.refreshing = true
    cache.generation = cache.generation + 1
    local generation = cache.generation

    scanner(cache.root, function(result)
        complete_refresh(cache, generation, result)
    end)
end

local function is_stale(cache, cache_ttl_ms)
    return not cache.labels or cache.scanned_at == 0 or (now_ms() - cache.scanned_at) > cache_ttl_ms
end

local function filter_labels(labels, token, exclude)
    local filtered = {}
    local lowered_token = token:lower()

    for _, label in ipairs(labels or {}) do
        if not exclude or not exclude[label] then
            if lowered_token == "" or label:lower():find(lowered_token, 1, true) then
                table.insert(filtered, label)
            end
        end
    end

    return filtered
end

local function result_for(labels, path_by_label, ctx, match, kind)
    return {
        items = M.make_items(labels, ctx, match, kind, path_by_label),
        is_incomplete_backward = true,
        is_incomplete_forward = true,
    }
end

local function callback_result(callback, labels, path_by_label, ctx, match, kind)
    callback(result_for(labels, path_by_label, ctx, match, kind))
end

local function item_path(item, root, strategy)
    if item.data and item.data.opencode_path then
        return item.data.opencode_path
    end

    local cache = caches[cache_key(root, strategy)]
    if cache then
        return cache.path_by_label[item.label]
    end

    return nil
end

local function assign_documentation(item, value)
    item.documentation = {
        kind = "markdown",
        value = value,
    }
end

function M.strip_extension(name)
    return (name:gsub("%.[^.]+$", ""))
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

function M.make_items(labels, ctx, match, kind, path_by_label)
    local items = {}
    local line = (ctx.cursor and ctx.cursor[1] or 1) - 1

    for _, label in ipairs(labels) do
        local item = {
            label = label,
            kind = kind,
            textEdit = {
                newText = label,
                range = {
                    start = { line = line, character = match.start_col },
                    ["end"] = { line = line, character = match.end_col },
                },
            },
        }

        local path = path_by_label and path_by_label[label]
        if path then
            item.data = {
                opencode_path = path,
            }
        end

        table.insert(items, item)
    end

    return items
end

function M.get_completions(params, callback)
    local opts = normalize_opts(params)
    local cache = get_cache(params.root, params.strategy)
    local canceled = false
    local sent_labels = {}
    local had_cache = cache.labels ~= nil

    if had_cache then
        local labels = filter_labels(cache.labels, params.match.token, nil)
        for _, label in ipairs(labels) do
            sent_labels[label] = true
        end
        callback_result(callback, labels, cache.path_by_label, params.ctx, params.match, params.kind)
    end

    if is_stale(cache, opts.cache_ttl_ms) then
        table.insert(cache.waiters, function(refreshed_cache)
            if canceled then
                return
            end

            if not refreshed_cache then
                if not had_cache then
                    callback_result(callback, {}, {}, params.ctx, params.match, params.kind)
                end
                return
            end

            local exclude = had_cache and sent_labels or nil
            local labels = filter_labels(refreshed_cache.labels, params.match.token, exclude)
            if #labels > 0 or not had_cache then
                callback_result(callback, labels, refreshed_cache.path_by_label, params.ctx, params.match, params.kind)
            end
        end)

        refresh_cache(cache)
    elseif not had_cache then
        callback_result(callback, {}, {}, params.ctx, params.match, params.kind)
    end

    return function()
        canceled = true
    end
end

function M.resolve(item, root, strategy, callback, opts)
    opts = normalize_opts(opts)
    local cache = get_cache(root, strategy)
    local path = item_path(item, root, strategy)
    if not path then
        callback(item)
        return nil
    end

    local cached_doc = cache.doc_by_path[path]
    if cached_doc then
        assign_documentation(item, cached_doc)
        callback(item)
        return nil
    end

    local canceled = false
    local max_bytes = math.max(0, opts.doc_max_bytes)

    uv.fs_open(path, "r", 438, function(open_err, fd)
        if open_err or not fd then
            if not canceled then
                vim.schedule(function()
                    if canceled then
                        return
                    end

                    callback(item)
                end)
            end
            return
        end

        uv.fs_read(fd, max_bytes + 1, 0, function(read_err, data)
            uv.fs_close(fd, function()
                if canceled then
                    return
                end

                vim.schedule(function()
                    if canceled then
                        return
                    end

                    if read_err or not data then
                        callback(item)
                        return
                    end

                    local value = data
                    if #value > max_bytes then
                        value = value:sub(1, max_bytes) .. TRUNCATION_NOTE
                    end

                    cache.doc_by_path[path] = value
                    assign_documentation(item, value)
                    callback(item)
                end)
            end)
        end)
    end)

    return function()
        canceled = true
    end
end

function M.clear_cache(root)
    for key, cache in pairs(caches) do
        if not root or cache.root == root then
            cache.generation = cache.generation + 1
            local waiters = cache.waiters
            cache.waiters = {}
            caches[key] = nil

            for _, waiter in ipairs(waiters) do
                vim.schedule(function()
                    waiter(nil)
                end)
            end
        end
    end
end

return M
