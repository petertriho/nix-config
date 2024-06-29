return {
    "akinsho/git-conflict.nvim",
    event = "VeryLazy",
    keys = {
        { "<leader>x", "<CMD>GitConflictListQf<CR>", desc = "conflict-qf" },
    },
    opts = {
        highlights = {
            ancestor = "DiffDelete",
            current = "DiffAdd",
            incoming = "DiffChange",
        },
    },
}
