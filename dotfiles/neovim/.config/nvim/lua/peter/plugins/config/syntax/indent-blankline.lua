return {
    "lukas-reineke/indent-blankline.nvim",
    event = "User LazyLoadFile",
    main = "ibl",
    opts = {
        indent = {
            char = "│",
            tab_char = "│",
        },
        scope = {
            show_start = false,
        },
    },
}
