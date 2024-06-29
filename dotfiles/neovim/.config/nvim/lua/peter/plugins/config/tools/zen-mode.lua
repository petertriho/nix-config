return {
    "folke/zen-mode.nvim",
    cmd = "ZenMode",
    keys = {
        { "<leader>z", "<CMD>ZenMode<CR>", desc = "zenmode" },
    },
    opts = {
        plugins = {
            twilight = { enabled = false },
        },
    },
}
