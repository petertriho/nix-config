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
        { "\\q", "<CMD>QFToggle<CR>", desc = "Qf List Toggle" },
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
