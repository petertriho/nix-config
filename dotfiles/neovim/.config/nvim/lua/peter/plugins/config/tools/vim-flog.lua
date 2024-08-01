return {
    "rbong/vim-flog",
    cmd = {
        "Flog",
        "Flogsplit",
        "Floggit",
    },
    keys = {
        { "<leader>gf", "<CMD>Flog<CR>", desc = "Flog" },
    },
    dependencies = { "tpope/vim-fugitive" },
}
