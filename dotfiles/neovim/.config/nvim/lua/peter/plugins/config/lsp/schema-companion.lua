return {
    "cenk1cenk2/schema-companion.nvim",
    lazy = true,
    keys = {
        {
            "<leader>lS",
            function()
                require("schema-companion").select_schema()
            end,
            desc = "Select Schema",
        },
        {
            "<leader>lm",
            function()
                require("schema-companion").match()
            end,
            desc = "Match Schema",
        },
        {
            "<leader>lM",
            function()
                require("schema-companion").select_matching_schema()
            end,
            desc = "Select Matching Schema",
        },
    },
    config = true,
}
