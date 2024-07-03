return {
    "kevinhwang91/nvim-hlslens",
    lazy = true,
    keys = {
        "/",
        { "n", "<CMD>execute('normal! ' . v:count1 . 'n')<CR><CMD>lua require('hlslens').start()<CR>" },
        { "N", "<CMD>execute('normal! ' . v:count1 . 'N')<CR><CMD>lua require('hlslens').start()<CR>" },
        { "g#", "g#<CMD>lua require('hlslens').start()<CR>" },
    },
    config = function()
        require("scrollbar.handlers.search").setup()
    end,
}
