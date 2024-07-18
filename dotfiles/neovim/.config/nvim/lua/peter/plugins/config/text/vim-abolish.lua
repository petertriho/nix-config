return {
    "petertriho/vim-abolish",
    cmd = { "Subvert", "S" },
    keys = {
        { "<leader>c", "<Plug>(abolish-coerce-word)", desc = "coerce" },
    },
    init = function()
        vim.g.abolish_no_mappings = 1
    end,
}
