return {
    "kwkarlwang/bufjump.nvim",
    keys = {
        "<M-i>",
        "<M-o>",
    },
    opts = {
        forward = "<M-i>",
        backward = "<M-o>",
        on_success = function()
            vim.cmd([[execute "normal! g`\"zz"]])
        end,
    },
}
