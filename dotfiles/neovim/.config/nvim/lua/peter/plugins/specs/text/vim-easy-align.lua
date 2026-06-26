return {
    "junegunn/vim-easy-align",
    cmd = {
        "EasyAlign",
        "LiveEasyAlign",
    },
    keys = {
        { "<leader>ia", "<Plug>(EasyAlign)", mode = { "n", "x" }, desc = "Align" },
        { "<leader>il", "<Plug>(LiveEasyAlign)", mode = { "n", "x" }, desc = "Live Align" },
    },
    init = function()
        vim.g.easy_align_ignore_groups = {}
    end,
}
