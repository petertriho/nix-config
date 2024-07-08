return {
    "akinsho/git-conflict.nvim",
    event = "User LazyLoadFile",
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
