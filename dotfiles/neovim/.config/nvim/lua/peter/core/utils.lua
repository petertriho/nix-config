local M = {
    BIG_FILE_LINE_COUNT = 5000,
    BIG_FILE_SIZE_BYTES = 100 * 1024,
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

    if vim.api.nvim_buf_line_count(bufnr) > M.BIG_FILE_LINE_COUNT then
        vim.b[bufnr].file_is_big = true
        return vim.b[bufnr].file_is_big
    end

    local ok, stats = pcall(vim.loop.fs_stat, path or vim.api.nvim_buf_get_name(bufnr))
    if ok and stats and stats.size > M.BIG_FILE_SIZE_BYTES then
        vim.b[bufnr].file_is_big = true
        return vim.b[bufnr].file_is_big
    end

    vim.b[bufnr].file_is_big = false
    return vim.b[bufnr].file_is_big
end

M.disable_features = function(bufnr)
    vim.cmd("syntax clear")
    vim.opt_local.syntax = "off"

    pcall(require("illuminate").pause_buf)
    pcall(require("ibl").setup_buffer, bufnr, { enabled = false })

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
            vim.cmd("bw " .. bufname)
        else
            vim.cmd(open_cmd)
        end
    end
end

return M
