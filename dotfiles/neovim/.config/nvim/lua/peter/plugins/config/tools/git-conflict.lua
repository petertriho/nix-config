return {
    "akinsho/git-conflict.nvim",
    event = "User LazyLoadFile",
    keys = {
        { "<leader>gC", "<CMD>GitConflictListQf<CR>", desc = "Qf Conflict" },
    },
    opts = {
        highlights = {
            ancestor = "DiffDelete",
            current = "DiffAdd",
            incoming = "DiffChange",
        },
    },
}
