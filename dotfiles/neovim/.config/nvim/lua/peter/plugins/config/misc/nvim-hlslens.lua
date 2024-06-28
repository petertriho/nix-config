return {
    "kevinhwang91/nvim-hlslens",
    lazy = true,
    keys = "/",
    init = function()
        local keymap = vim.keymap.set
        local opts = { noremap = true, silent = true }

        keymap("n", "n", "<CMD>execute('normal! ' . v:count1 . 'n')<CR><CMD>lua require('hlslens').start()<CR>", opts)
        keymap("n", "N", "<CMD>execute('normal! ' . v:count1 . 'N')<CR><CMD>lua require('hlslens').start()<CR>", opts)
        keymap("n", "g#", "g#<CMD>lua require('hlslens').start()<CR>", opts)
    end,
    config = function()
        require("scrollbar.handlers.search").setup()
    end,
}
