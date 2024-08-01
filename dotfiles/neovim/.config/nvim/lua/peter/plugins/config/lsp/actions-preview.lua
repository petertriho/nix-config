return {
    "aznhe21/actions-preview.nvim",
    keys = {
        {
            "<leader>q",
            function()
                require("actions-preview").code_actions()
            end,
            mode = { "v", "n" },
            desc = "Quickfix",
        },
    },
    config = true,
}
