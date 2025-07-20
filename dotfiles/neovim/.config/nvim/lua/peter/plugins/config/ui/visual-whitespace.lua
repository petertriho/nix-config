return {
    "mcauley-penney/visual-whitespace.nvim",
    config = true,
    event = "ModeChanged *:[vV\22]",
    opts = {
        match_types = {
            space = true,
            tab = true,
            nbsp = true,
            lead = false,
            trail = true,
        },
        list_chars = {
            space = "·",
            tab = "»",
            nbsp = "¤",
            lead = "‹",
            trail = "›",
        },
        fileformat_chars = {
            unix = "¬",
            mac = "↲",
            dos = "",
        },
    },
}
