return {
    "petertriho/vim-abolish",
    cmd = { "Subvert", "S" },
    keys = {
        "<leader>c ",
        "<leader>c-",
        "<leader>c.",
        "<leader>c_",
        "<leader>cc",
        "<leader>ck",
        "<leader>cm",
        "<leader>cs",
        "<leader>ct",
        "<leader>cu",
        "<leader>cU",
    },
    init = function()
        vim.g.abolish_no_mappings = 1
        vim.keymap.set("n", "<leader>c", "<Plug>(abolish-coerce-word)", { desc = "coerce" })
    end,
}
