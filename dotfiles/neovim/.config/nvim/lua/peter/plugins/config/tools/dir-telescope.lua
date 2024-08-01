return {
    "princejoogie/dir-telescope.nvim",
    keys = {
        { "<leader>td", "<CMD>Telescope dir find_files<CR>", desc = "Dir Find Files" },
        { "<leader>ts", "<CMD>Telescope dir live_grep<CR>", desc = "Dir Search Text" },
    },
    opts = {
        hidden = true,
        no_ignore = false,
        show_preview = true,
    },
}
