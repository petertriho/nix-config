return {
    "cappyzawa/trim.nvim",
    event = "BufWritePre",
    opts = {
        trim_trailing = true,
        trim_first_line = false,
        trim_last_line = true,
    },
}
