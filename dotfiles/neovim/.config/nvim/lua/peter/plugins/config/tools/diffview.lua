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
        { "<leader>gd", "<CMD>DiffviewOpen<CR>", desc = "diffview" },
        { "<leader>gh", "<CMD>DiffviewFileHistory %<CR>", desc = "history-file" },
    },
    config = true,
}
