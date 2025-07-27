return {
    -- Custom Lua rewrite of vim-mundo with improved diff and tree visualization
    dir = "~/.config/nvim/plugins/nvim-mundo",
    cmd = {
        "MundoToggle",
        "MundoShow",
        "MundoHide",
    },
    keys = {
        { "<leader>u", "<CMD>MundoToggle<CR>", desc = "Undotree" },
    },
    opts = {},
}
