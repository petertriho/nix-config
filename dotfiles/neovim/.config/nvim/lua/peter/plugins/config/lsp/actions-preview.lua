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
    config = true,
}
