-- Not cached: `LspDetach` fires before the client leaves the buffer, and a per-window cache would show
-- the previous buffer's count after `:buffer`. Counting is as cheap as the attach check it replaces.
return {
    provider = function()
        local count = #vim.lsp.get_clients({ bufnr = 0 })
        return count > 0 and (" 󰒓 " .. count)
    end,
}
