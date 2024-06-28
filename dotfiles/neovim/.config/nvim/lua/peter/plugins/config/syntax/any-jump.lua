return {
    "pechorin/any-jump.vim",
    cmd = {
        "AnyJump",
        "AnyJumpVisual",
        "AnyJumpBack",
        "AnyJumpLastResults",
    },
    init = function()
        vim.g.any_jump_disable_default_keybindings = 1

        local keymap = vim.keymap.set

        keymap("n", "gj", "<CMD>AnyJump<CR>", {})
        keymap("n", "gJ", "<CMD>AnyJumpBack<CR>", {})
        keymap("n", "gk", "<CMD>AnyJumpLastResults<CR>", {})
        keymap("x", "gj", "<CMD>AnyJumpVisual<CR>", {})
    end,
}
