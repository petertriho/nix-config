return {
    "princejoogie/dir-telescope.nvim",
    keys = {
        { "<leader>t;", "<CMD>Telescope dir find_files<CR>", desc = "Find Files (Dir)" },
        { "<leader>t,", "<CMD>Telescope dir live_grep<CR>", desc = "Live Grep (Dir)" },
    },
    opts = {
        hidden = true,
        no_ignore = false,
        show_preview = true,
    },
}
