return {
    "stevearc/quicker.nvim",
    ft = "qf",
    keys = {
        {

            "<leader>q",
            function()
                require("quicker").toggle({
                    focus = true,
                    open_cmd_mods = { split = "botright" },
                })
            end,
            desc = "QF Toggle",
        },
        {

            "<leader>Q",
            function()
                require("quicker").toggle({
                    loclist = true,
                    focus = true,
                    open_cmd_mods = { split = "botright" },
                })
            end,
            desc = "LOC Toggle",
        },
    },
    opts = {
        follow = {
            enabled = true,
        },
        keys = {
            {
                ">",
                function()
                    require("quicker").expand({ before = 2, after = 2, add_to_existing = true })
                end,
                desc = "Expand QF context",
            },
            {
                "<",
                function()
                    require("quicker").collapse()
                end,
                desc = "Collapse QF context",
            },
        },
    },
}
