return {
    "pechorin/any-jump.vim",
    cmd = {
        "AnyJump",
        "AnyJumpArg",
        "AnyJumpBack",
        "AnyJumpLastResults",
        "AnyJumpVisual",
    },
    keys = {
        { "<leader>jj", "<CMD>AnyJump<CR>", desc = "AnyJump" },
        { "<leader>jb", "<CMD>AnyJumpBack<CR>", desc = "AnyJump Back" },
        { "<leader>jl", "<CMD>AnyJumpLastResults<CR>", desc = "AnyJump Last Results" },
        { "<leader>jj", "<CMD>AnyJumpVisual<CR>", mode = "x", desc = "AnyJump Visual" },
    },
    init = function()
        vim.g.any_jump_disable_default_keybindings = 1
    end,
}
