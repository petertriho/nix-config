return {
    "chrisgrieser/nvim-rulebook",
    event = { "User LazyLoadFile", "VeryLazy" },
    keys = {
        {
            "<leader>Ri",
            function()
                require("rulebook").ignoreRule()
            end,
            desc = "Ignore rule",
        },
        {
            "<leader>Rl",
            function()
                require("rulebook").lookupRule()
            end,
            desc = "Lookup rule",
        },
        {
            "<leader>Ry",
            function()
                require("rulebook").yankDiagnosticCode()
            end,
            desc = "Yank diagnostic code",
        },
        {
            "<leader>Rf",
            function()
                require("rulebook").suppressFormatter()
            end,
            desc = "Suppress formatter",
        },
    },
}
