return {
    "stevearc/qf_helper.nvim",
    cmd = {
        "QNext",
        "QPrev",
        "LLToggle",
        "QFToggle",
        "Keep",
        "Reject",
    },
    ft = "qf",
    keys = {
        { "\\l", "<CMD>LLToggle<CR>", desc = "Loc List Toggle" },
        { "<leader>q", "<CMD>QFToggle<CR>", desc = "Qf List Toggle" },
        { "<C-M-n>", "<CMD>QNext<CR>" },
        { "<C-M-p>", "<CMD>QPrev<CR>" },
    },
    opts = {
        quickfix = {
            default_bindings = false,
            min_height = 10,
        },
        loclist = {
            default_bindings = false,
            min_height = 10,
        },
    },
}
