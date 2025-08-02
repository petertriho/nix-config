return {
    "aznhe21/actions-preview.nvim",
    keys = {
        {
            "<leader>k",
            function()
                require("actions-preview").code_actions()
            end,
            mode = { "n", "v" },
            desc = "Quickfix",
        },
    },
    opts = {
        backend = {
            "snacks",
            "minipick",
            "telescope",
            "nui",
        },
        snacks = {
            layout = "dropdown",
            win = {
                input = {
                    keys = {
                        ["1"] = { "select_1", mode = { "n", "i" } },
                        ["2"] = { "select_2", mode = { "n", "i" } },
                        ["3"] = { "select_3", mode = { "n", "i" } },
                        ["4"] = { "select_4", mode = { "n", "i" } },
                        ["5"] = { "select_5", mode = { "n", "i" } },
                        ["6"] = { "select_6", mode = { "n", "i" } },
                        ["7"] = { "select_7", mode = { "n", "i" } },
                        ["8"] = { "select_8", mode = { "n", "i" } },
                        ["9"] = { "select_9", mode = { "n", "i" } },
                        ["0"] = { "select_0", mode = { "n", "i" } },
                    },
                },
            },
        },
    },
}
