return {
    provider = function()
        local pos = vim.api.nvim_win_get_cursor(vim.api.nvim_get_current_win())
        return string.format("󰈻 %d:%d", pos[1], pos[2] + 1)
    end,
}
