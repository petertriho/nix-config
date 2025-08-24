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
        {
            "ah",
            function()
                require("various-textobjs").color("outer")
            end,
            mode = { "o", "x" },
            desc = "Outer color",
        },
        {
            "ih",
            function()
                require("various-textobjs").color("inner")
            end,
            mode = { "o", "x" },
            desc = "Inner color",
        },
        {
            "ak",
            function()
                require("various-textobjs").key("outer")
            end,
            mode = { "o", "x" },
            desc = "Outer key",
        },
        {
            "ik",
            function()
                require("various-textobjs").key("inner")
            end,
            mode = { "o", "x" },
            desc = "Inner key",
        },
        {
            "an",
            function()
                require("various-textobjs").number("outer")
            end,
            mode = { "o", "x" },
            desc = "Outer number",
        },
        {
            "in",
            function()
                require("various-textobjs").number("inner")
            end,
            mode = { "o", "x" },
            desc = "Inner number",
        },
        {
            "au",
            function()
                require("various-textobjs").url("outer")
            end,
            mode = { "o", "x" },
            desc = "Outer URL",
        },
        {
            "iu",
            function()
                require("various-textobjs").url("inner")
            end,
            mode = { "o", "x" },
            desc = "Inner URL",
        },
        {
            "iv",
            function()
                require("various-textobjs").value("inner")
            end,
            mode = { "o", "x" },
            desc = "Inner value",
        },
        {
            "av",
            function()
                require("various-textobjs").value("outer")
            end,
            mode = { "o", "x" },
            desc = "Outer value",
        },
    },
}
