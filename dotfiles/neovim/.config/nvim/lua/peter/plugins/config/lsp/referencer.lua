return {
    "romus204/referencer.nvim",
    event = { "User LazyLoadFile" },
    config = function()
        require("referencer").setup({
            enable = true,
            format = "  %d ref(s)",
            hl_group = "LspInlayHint",
        })
    end,
}
