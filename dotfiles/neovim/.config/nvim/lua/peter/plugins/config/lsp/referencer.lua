return {
    "romus204/referencer.nvim",
    enabled = false,
    event = { "User LazyLoadFile" },
    config = function()
        require("referencer").setup({
            enable = true,
            format = "  %d ref(s)",
            hl_group = "LspInlayHint",
        })
    end,
}
