return {
    "lukas-reineke/indent-blankline.nvim",
    event = "User LazyLoadFile",
    main = "ibl",
    opts = {
        indent = {
            char = "│",
        },
        scope = {
            show_start = false,
        },
    },
}
