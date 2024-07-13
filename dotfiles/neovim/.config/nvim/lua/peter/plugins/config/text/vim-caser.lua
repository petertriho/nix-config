return {
    "arthurxavierx/vim-caser",
    keys = {
        "cC ",
        "cC-",
        "cC.",
        "cC_",
        "cCc",
        "cCk",
        "cCK",
        "cCm",
        "cCp",
        "cCs",
        "cCt",
        "cCu",
        "cCU",
    },
    init = function()
        vim.g.caser_prefix = "cC"
    end,
}
