return {
    "chentoast/marks.nvim",
    keys = {
        { "<leader>ma", "<CMD>MarksListAll<CR>", desc = "all-list" },
        { "<leader>mb", "<CMD>BookmarksListAll<CR>", desc = "bookmarks-list" },
        { "<leader>mg", "<CMD>MarksListGlobal<CR>", desc = "global-list" },
        { "<leader>ml", "<CMD>MarksListBuf<CR>", desc = "local-list" },
        { "<leader>mt", "<CMD>MarksToggleSigns<CR>", desc = "toggle-signs" },
    },
    config = true,
}
