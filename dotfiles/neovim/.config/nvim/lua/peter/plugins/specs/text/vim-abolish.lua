return {
    "petertriho/vim-abolish",
    cmd = { "Subvert", "S" },
    init = function()
        vim.g.abolish_no_mappings = 1
    end,
}
