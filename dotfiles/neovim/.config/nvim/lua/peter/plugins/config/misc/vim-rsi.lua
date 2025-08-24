return {
    "tpope/vim-rsi",
    event = "CmdlineEnter",
    init = function()
        vim.g.rs_no_meta = 1
    end,
}
