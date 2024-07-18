return {
    "kwkarlwang/bufjump.nvim",
    keys = {
        "<M-i>",
        "<M-o>",
    },
    opts = {
        forward_key = "<M-i>",
        backward_key = "<M-o>",
        on_success = function()
            vim.cmd([[execute "normal! g`\"zz"]])
        end,
    },
}
