return {
    "pechorin/any-jump.vim",
    cmd = {
        "AnyJump",
        "AnyJumpVisual",
        "AnyJumpBack",
        "AnyJumpLastResults",
    },
    keys = {
        { "gj", "<CMD>AnyJump<CR>", desc = "AnyJump" },
        { "gJ", "<CMD>AnyJumpBack<CR>", desc = "AnyJumpBack" },
        { "gk", "<CMD>AnyJumpLastResults<CR>", desc = "AJLastResults" },
        { "gj", "<CMD>AnyJumpVisual<CR>", mode = "x", desc = "AnyJumpVisual" },
    },
    init = function()
        vim.g.any_jump_disable_default_keybindings = 1
    end,
}
