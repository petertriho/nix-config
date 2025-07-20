return {
    "j-hui/fidget.nvim",
    event = "VeryLazy",
    keys = {
        { "<leader>Xf", "<CMD>Fidget clear<CR>", desc = "Fidget Clear" },
    },
    opts = {
        integration = {
            ["nvim-tree"] = {
                enable = false,
            },
        },
    },
}
