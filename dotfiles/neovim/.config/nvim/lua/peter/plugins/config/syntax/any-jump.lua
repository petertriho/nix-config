return {
    "pechorin/any-jump.vim",
    cmd = {
        "AnyJump",
        "AnyJumpVisual",
        "AnyJumpBack",
        "AnyJumpLastResults",
    },
    keys = {
        { "gj", "<CMD>AnyJump<CR>" },
        { "gJ", "<CMD>AnyJumpBack<CR>" },
        { "gk", "<CMD>AnyJumpLastResults<CR>" },
        { "gj", "<CMD>AnyJumpVisual<CR>", mode = "x" },
    },
    init = function()
        vim.g.any_jump_disable_default_keybindings = 1
    end,
}
