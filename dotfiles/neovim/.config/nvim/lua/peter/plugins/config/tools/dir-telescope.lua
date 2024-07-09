return {
    "princejoogie/dir-telescope.nvim",
    keys = {
        { "<leader>td", "<CMD>Telescope dir find_files<CR>", desc = "dir-find-files" },
        { "<leader>ts", "<CMD>Telescope dir live_grep<CR>", desc = "dir-search-text" },
    },
    opts = {
        hidden = true,
        no_ignore = false,
        show_preview = true,
    },
}
