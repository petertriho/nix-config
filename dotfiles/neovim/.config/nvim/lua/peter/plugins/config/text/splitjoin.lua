return {
    "AndrewRadev/splitjoin.vim",
    cmd = { "SplitjoinJoin", "SplitjoinSplit" },
    init = function()
        vim.g.splitjoin_split_mapping = ""
        vim.g.splitjoin_join_mapping = ""
    end,
}
