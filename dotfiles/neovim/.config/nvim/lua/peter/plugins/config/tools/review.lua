return {
    "georgeguimaraes/review.nvim",
    dependencies = {
        "esmuellert/codediff.nvim",
        "MunifTanjim/nui.nvim",
    },
    cmd = { "Review" },
    keys = {
        { "<leader>r", "<CMD>Review<CR>", desc = "Review" },
        { "<leader>R", "<CMD>Review commits<CR>", desc = "Review commits" },
    },
    opts = {},
}
