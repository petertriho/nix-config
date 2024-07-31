local M = {
    BIG_FILE_LINE_COUNT = 5000,
    BIG_FILE_SIZE_BYTES = 100 * 1024,
}

M.file_is_big = function(bufnr)
    if vim.b.file_is_big ~= nil then
        return vim.b.file_is_big
    end

    if vim.api.nvim_buf_line_count(bufnr) > M.BIG_FILE_LINE_COUNT then
        vim.b.file_is_big = true
        M.disable_features(bufnr)
        return vim.b.file_is_big
    end

    local ok, stats = pcall(vim.loop.fs_stat, vim.api.nvim_buf_get_name(bufnr))
    if ok and stats and stats.size > M.BIG_FILE_SIZE_BYTES then
        vim.b.file_is_big = true
        M.disable_features(bufnr)
        return vim.b.file_is_big
    end

    vim.b.file_is_big = false
    return vim.b.file_is_big
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

return M
