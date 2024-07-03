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
        { "\\l", "<CMD>LLToggle<CR>", desc = "loc-list-toggle" },
        { "\\q", "<CMD>QFToggle<CR>", desc = "qf-list-toggle" },
        { "<M-n>", "<CMD>QNext<CR>" },
        { "<M-p>", "<CMD>QPrev<CR>" },
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
