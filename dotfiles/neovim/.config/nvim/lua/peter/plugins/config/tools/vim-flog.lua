return {
    "rbong/vim-flog",
    cmd = {
        "Flog",
        "Flogsplit",
        "Floggit",
    },
    keys = {
        { "<leader>gf", "<CMD>Flog<CR>", desc = "flog" },
    },
    dependencies = { "tpope/vim-fugitive" },
}
