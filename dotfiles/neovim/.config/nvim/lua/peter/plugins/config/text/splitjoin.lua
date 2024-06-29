return {
    "AndrewRadev/splitjoin.vim",
    cmd = { "SplitjoinJoin", "SplitjoinSplit" },
    keys = {
        { "<leader>aj", "<CMD>SplitjoinJoin<CR>", desc = "join-lines" },
        { "<leader>ax", "<CMD>SplitjoinJoin<CR>", desc = "split-lines" },
    },
    init = function()
        vim.g.splitjoin_split_mapping = ""
        vim.g.splitjoin_join_mapping = ""
    end,
}
