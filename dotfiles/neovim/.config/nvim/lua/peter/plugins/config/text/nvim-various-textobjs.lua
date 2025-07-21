return {
    "chrisgrieser/nvim-various-textobjs",
    keys = {
        {
            "a\\w",
            function()
                require("various-textobjs").subword("outer")
            end,
            mode = { "o", "x" },
            desc = "Outer subword",
        },
        {
            "i\\w",
            function()
                require("various-textobjs").subword("inner")
            end,
            mode = { "o", "x" },
            desc = "Inner subword",
        },
    },
}
