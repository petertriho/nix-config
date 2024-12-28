return {
    "stevearc/quicker.nvim",
    ft = "qf",
    keys = {
        {

            "<leader>q",
            function()
                require("quicker").toggle({ open_cmd_mods = { split = "botright" } })
            end,
            desc = "QF Toggle",
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
