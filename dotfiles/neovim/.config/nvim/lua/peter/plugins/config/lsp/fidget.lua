return {
    "j-hui/fidget.nvim",
    event = "VeryLazy",
    keys = {
        { "<leader>of", "<CMD>Fidget clear<CR>", desc = "Fidget Clear" },
    },
    opts = {
        integration = {
            ["nvim-tree"] = {
                enable = false,
            },
        },
    },
}
