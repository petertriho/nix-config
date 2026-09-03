return {
    "celeste3z/celeste_comment.nvim",
    keys = {
        { "gc", mode = { "n", "x", "o" } },
        { "gb", mode = { "n", "x", "o" } },
        "gcc",
        "gbc",
        "gco",
        "gcO",
        "gcA",
    },
    opts = {
        mappings = {
            line_add_below = "gco",
            line_add_above = "gcO",
            line_add_eol = "gcA",
        },
    },
}
