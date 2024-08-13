return {
    "princejoogie/dir-telescope.nvim",
    keys = {
        { "<leader>tf", "<CMD>Telescope dir find_files<CR>", desc = "Find Files (Dir)" },
        { "<leader>tl", "<CMD>Telescope dir live_grep<CR>", desc = "Live Grep (Dir)" },
    },
    opts = {
        hidden = true,
        no_ignore = false,
        show_preview = true,
    },
}
