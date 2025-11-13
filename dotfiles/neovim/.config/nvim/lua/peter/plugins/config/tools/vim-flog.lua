return {
    "rbong/vim-flog",
    cmd = {
        "Flog",
        "Flogsplit",
        "Floggit",
    },
    keys = {
        { "<leader>gF", "<CMD>Flog<CR>", desc = "Flog" },
    },
    dependencies = { "tpope/vim-fugitive" },
}
