return {
    "chrisgrieser/nvim-spider",
    keys = {
        {
            "\\w",
            function()
                require("spider").motion("w")
            end,
            mode = { "n", "o", "x" },
            desc = "Next subword",
        },
        {
            "\\e",
            function()
                require("spider").motion("e")
            end,
            mode = { "n", "o", "x" },
            desc = "End of subword",
        },
        {
            "\\b",
            function()
                require("spider").motion("b")
            end,
            mode = { "n", "o", "x" },
            desc = "Previous subword",
        },
    },
}
