return {
    "chrisgrieser/nvim-rulebook",
    event = { "User LazyLoadFile", "VeryLazy" },
    keys = {
        {
            "<leader>ri",
            function()
                require("rulebook").ignoreRule()
            end,
            desc = "Ignore rule",
        },
        {
            "<leader>rl",
            function()
                require("rulebook").lookupRule()
            end,
            desc = "Lookup rule",
        },
        {
            "<leader>ry",
            function()
                require("rulebook").yankDiagnosticCode()
            end,
            desc = "Yank diagnostic code",
        },
        {
            "<leader>rf",
            function()
                require("rulebook").suppressFormatter()
            end,
            desc = "Suppress formatter",
        },
    },
}
