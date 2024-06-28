return {
    "akinsho/git-conflict.nvim",
    event = "VeryLazy",
    opts = {
        highlights = {
            ancestor = "DiffDelete",
            current = "DiffAdd",
            incoming = "DiffChange",
        },
    },
}
