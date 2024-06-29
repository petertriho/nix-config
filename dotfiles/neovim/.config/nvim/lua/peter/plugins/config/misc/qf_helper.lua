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
    },
    init = function()
        local keymap = vim.keymap.set
        local opts = { noremap = true, silent = true }

        keymap("n", "<M-n>", "<CMD>QNext<CR>", opts)
        keymap("n", "<M-p>", "<CMD>QPrev<CR>", opts)
    end,
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
