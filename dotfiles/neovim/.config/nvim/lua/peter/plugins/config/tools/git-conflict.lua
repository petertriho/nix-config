return {
    "akinsho/git-conflict.nvim",
    event = "User LazyLoadFile",
    keys = {
        { "\\gc", "<CMD>GitConflictListQf<CR>", desc = "Qf Conflict" },
    },
    opts = {
        highlights = {
            ancestor = "DiffDelete",
            current = "DiffAdd",
            incoming = "DiffChange",
        },
    },
}
