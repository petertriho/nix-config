return {
    "petertriho/vim-abolish",
    cmd = { "Subvert", "S" },
    keys = {
        { "\\c", "<Plug>(abolish-coerce-word)", desc = "Coerce" },
    },
    init = function()
        vim.g.abolish_no_mappings = 1
    end,
}
