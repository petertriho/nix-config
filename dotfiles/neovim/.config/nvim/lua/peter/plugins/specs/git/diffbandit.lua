return {
    "CoreyKaylor/diffbandit.nvim",
    cmd = {
        "DiffBandit",
        "DiffBanditBuffers",
        "DiffBanditFolderDiff",
        "DiffBanditGit",
        "DiffBanditGitCurrent",
        "DiffBanditGitMenu",
        "DiffBanditGitLog",
        "DiffBanditGitCommit",
        "DiffBanditGitCompare",
        "DiffBanditGitCheckout",
        "DiffBanditMerge",
        "DiffBanditCommitPanel",
    },
    keys = {
        { "<leader>gg", "<CMD>DiffBanditGit<CR>", desc = "Repo Changes" },
        { "<leader>gi", "<CMD>DiffBanditGitCurrent<CR>", desc = "Diff Current File" },
        { "<leader>gp", "<CMD>DiffBanditCommitPanel<CR>", desc = "Commit Panel" },
        { "<leader>go", "<CMD>DiffBanditGitMenu<CR>", desc = "Git Menu" },
        { "<leader>gm", "<CMD>DiffBanditMerge<CR>", desc = "Merge Conflicts" },
        { "<leader>gv", ":DiffBandit ", desc = "Diff Two Files" },
    },
    config = function()
        require("diffbandit").setup()
    end,
}
