return {
    "petertriho/nvim-mundo",
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
