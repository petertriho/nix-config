return {
    "esmuellert/codediff.nvim",
    dependencies = { "MunifTanjim/nui.nvim" },
    cmd = { "CodeDiff" },
    keys = {
        { "<leader>gD", "<CMD>CodeDiff<CR>", desc = "CodeDiff" },
        { "<leader>gH", "<CMD>CodeDiff history %<CR>", desc = "History File" },
    },
}
