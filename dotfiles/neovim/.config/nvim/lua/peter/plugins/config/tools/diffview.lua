return {
    "sindrets/diffview.nvim",
    cmd = {
        "DiffviewOpen",
        "DiffviewClose",
        "DiffviewToggleFiles",
        "DiffviewFocusFiles",
        "DiffviewRefresh",
        "DiffviewFileHistory",
    },
    keys = {
        { "<leader>gD", "<CMD>DiffviewOpen<CR>", desc = "Diffview" },
        { "<leader>gH", "<CMD>DiffviewFileHistory %<CR>", desc = "History File" },
    },
    config = true,
}
