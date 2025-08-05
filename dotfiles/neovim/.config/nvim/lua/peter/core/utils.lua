local M = {
    BIG_FILE_LINE_COUNT = 5000,
    BIG_FILE_SIZE_BYTES = 1024 * 1024,
    BIG_FILE_LINE_SIZE = 1000,
}

-- by https://github.com/folke/snacks.nvim/blob/main/lua/snacks/bigfile.lua
M.bigfile_setup = function()
    vim.filetype.add({
        pattern = {
            [".*"] = {
                function(path, buf)
                    if M.file_is_big(buf, path) then
                        return "bigfile"
                    end
                end,
            },
        },
    })

    vim.api.nvim_create_autocmd({ "FileType" }, {
        group = vim.api.nvim_create_augroup("_bigfile", { clear = true }),
        pattern = "bigfile",
        callback = function(ev)
            M.disable_features(ev.buf)
        end,
    })
end

M.file_is_big = function(bufnr, path)
    if vim.b[bufnr].file_is_big ~= nil then
        return vim.b[bufnr].file_is_big
    end

    if vim.bo[bufnr].filetype == "bigfile" then
        vim.b[bufnr].file_is_big = true
        return vim.b[bufnr].file_is_big
    end

    local line_count = vim.api.nvim_buf_line_count(bufnr)

    if line_count == 0 then
        vim.b[bufnr].file_is_big = false
        return vim.b[bufnr].file_is_big
    end

    if line_count > M.BIG_FILE_LINE_COUNT then
        vim.b[bufnr].file_is_big = true
        return vim.b[bufnr].file_is_big
    end

    local ok, stats = pcall(vim.loop.fs_stat, path or vim.api.nvim_buf_get_name(bufnr))
    if ok and stats and stats.size > M.BIG_FILE_SIZE_BYTES then
        vim.b[bufnr].file_is_big = true
        return vim.b[bufnr].file_is_big
    end

    if ok and stats and ((stats.size - line_count) / line_count) > M.BIG_FILE_LINE_SIZE then
        vim.b[bufnr].file_is_big = true
        return vim.b[bufnr].file_is_big
    end

    vim.b[bufnr].file_is_big = false
    return vim.b[bufnr].file_is_big
end

M.disable_features = function(bufnr)
    vim.cmd.syntax("clear")
    vim.opt_local.syntax = "off"

    -- pcall(require("illuminate").pause_buf)

    vim.b.matchup_matchparen_enabled = 0
    vim.b.matchup_motion_enabled = 0
    vim.b.matchup_text_obj_enabled = 0
    vim.b.matchup_matchparen_fallback = 0
end

M.new_timer = function()
    return (vim.uv or vim.loop).new_timer()
end

M.debounce = function(func, timer, debounce_ms)
    return function()
        local bufnr = vim.api.nvim_get_current_buf()
        timer:stop()
        timer:start(
            debounce_ms,
            0,
            vim.schedule_wrap(function()
                if vim.api.nvim_buf_is_valid(bufnr) then
                    vim.api.nvim_buf_call(bufnr, function()
                        func(bufnr)
                    end)
                end
            end)
        )
    end
end

M.toggle_buffer = function(buf, open_cmd)
    return function()
        local bufname = vim.fn.bufname(buf)

        if vim.fn.bufexists(bufname) == 1 then
            vim.cmd.bw(bufname)
        else
            vim.cmd(open_cmd)
        end
    end
end

M.get_ft_map = function(type)
    local var = "ft_map_cache" .. type
    local ok, ft_map = pcall(function()
        return vim.api.nvim_get_var(var)
    end)

    if not ok then
        ft_map = {}
        for _, filetype in ipairs(require("peter.core.filetypes")[type]) do
            ft_map[filetype] = true
        end
        vim.api.nvim_set_var(var, ft_map)
    end

    return ft_map
end

M.is_ft = function(type, filetype)
    local filetype_map = M.get_ft_map(type)
    return filetype_map[filetype] == true
end

M.generate_uuid = function()
    local template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
    return string.gsub(template, "[xy]", function(c)
        local v = (c == "x") and math.random(0, 0xf) or math.random(8, 0xb)
        return string.format("%x", v)
    end)
end

M.spinner = {
    frames = { "⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏" },
    get_frame = function(self)
        return self.frames[math.floor(vim.uv.hrtime() / (1e6 * 80)) % #self.frames + 1]
    end,
}

M.create_progress_notification = function(opts)
    opts = opts or {}
    local id = opts.id or "progress"
    local title = opts.title or "Progress"
    local message = opts.message or ""
    local level = opts.level or vim.log.levels.INFO

    vim.notify(message, level, {
        id = id,
        title = title,
        opts = function(notif)
            notif.icon = M.spinner:get_frame()
        end,
    })
end

M.finish_progress_notification = function(opts)
    opts = opts or {}
    local id = opts.id or "progress"
    local title = opts.title or "Complete"
    local message = opts.message or ""
    local level = opts.level or vim.log.levels.INFO
    local icon = opts.icon or ""
    local error_icon = opts.error_icon or ""

    local final_icon = (level == vim.log.levels.ERROR) and error_icon or icon

    vim.notify(message, level, {
        id = id,
        title = title,
        opts = function(notif)
            notif.icon = final_icon
        end,
    })
end

return M
