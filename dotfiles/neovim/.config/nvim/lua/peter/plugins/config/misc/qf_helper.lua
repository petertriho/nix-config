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
