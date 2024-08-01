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
        { "<leader>gd", "<CMD>DiffviewOpen<CR>", desc = "Diffview" },
        { "<leader>gh", "<CMD>DiffviewFileHistory %<CR>", desc = "History File" },
    },
    config = true,
}
