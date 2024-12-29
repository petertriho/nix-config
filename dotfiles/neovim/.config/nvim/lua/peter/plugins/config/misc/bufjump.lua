return {
    "kwkarlwang/bufjump.nvim",
    keys = {
        "<C-M-i>",
        "<C-M-o>",
    },
    opts = {
        forward_key = "<C-M-i>",
        backward_key = "<C-M-o>",
        on_success = function()
            vim.cmd([[execute "normal! g`\"zz"]])
        end,
    },
}
