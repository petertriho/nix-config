return {
    "georgeguimaraes/review.nvim",
    dependencies = {
        "esmuellert/codediff.nvim",
        "MunifTanjim/nui.nvim",
    },
    cmd = { "Review" },
    keys = {
        { "<leader>gr", "<CMD>Review<CR>", desc = "Review" },
        { "<leader>gR", "<CMD>Review commits<CR>", desc = "Review commits" },
    },
    opts = {},
}
