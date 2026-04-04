return {
    "petertriho/nvim-mundo",
    cmd = {
        "MundoToggle",
        "MundoShow",
        "MundoHide",
    },
    keys = {
        { "<leader>U", "<CMD>MundoToggle<CR>", desc = "Undotree" },
    },
    opts = {
        mirror_graph = true,
    },
}
