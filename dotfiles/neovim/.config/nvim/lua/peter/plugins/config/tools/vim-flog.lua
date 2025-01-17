return {
    "rbong/vim-flog",
    cmd = {
        "Flog",
        "Flogsplit",
        "Floggit",
    },
    keys = {
        { "<leader>gl", "<CMD>Flog<CR>", desc = "Log" },
    },
    dependencies = { "tpope/vim-fugitive" },
}
