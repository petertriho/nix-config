return {
    "chrisgrieser/nvim-tinygit",
    keys = {
        {
            "<leader>ga",
            function()
                require("tinygit").amendOnlyMsg({ forcePushIfDiverged = false })
            end,
            desc = "Amend Only Msg",
        },
        {
            "<leader>gA",
            function()
                require("tinygit").amendNoEdit({ forcePushIfDiverged = false, stageAllIfNothingStaged = true })
            end,
            desc = "Amend No Edit",
        },
        {
            "<leader>gc",
            function()
                require("tinygit").smartCommit({ pushIfClean = false, pullBeforePush = true })
            end,
            desc = "Commit",
        },
        {
            "<leader>gh",
            function()
                require("tinygit").fileHistory()
            end,
            desc = "History Search",
            mode = { "n", "v" },
        },
    },
}
