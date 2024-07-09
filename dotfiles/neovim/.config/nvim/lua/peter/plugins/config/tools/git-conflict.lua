return {
    "akinsho/git-conflict.nvim",
    event = "User LazyLoadFile",
    keys = {
        { "\\x", "<CMD>GitConflictListQf<CR>", desc = "qf-conflict" },
    },
    opts = {
        highlights = {
            ancestor = "DiffDelete",
            current = "DiffAdd",
            incoming = "DiffChange",
        },
    },
}
