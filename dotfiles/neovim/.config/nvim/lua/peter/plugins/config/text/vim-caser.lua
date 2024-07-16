return {
    "arthurxavierx/vim-caser",
    keys = {
        "<leader>C ",
        "<leader>C-",
        "<leader>C.",
        "<leader>C_",
        "<leader>Cc",
        "<leader>Ck",
        "<leader>CK",
        "<leader>Cm",
        "<leader>Cp",
        "<leader>Cs",
        "<leader>Ct",
        "<leader>Cu",
        "<leader>CU",
    },
    init = function()
        vim.g.caser_prefix = "<leader>C"
    end,
}
