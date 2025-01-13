return {
    "junegunn/vim-easy-align",
    cmd = {
        "EasyAlign",
        "LiveEasyAlign",
    },
    keys = {
        { "<leader>oa", "<Plug>(EasyAlign)", mode = { "n", "x" }, desc = "Align" },
        { "<leader>ol", "<Plug>(LiveEasyAlign)", mode = { "n", "x" }, desc = "Live Align" },
    },
    init = function()
        vim.g.easy_align_ignore_groups = {}
    end,
}
