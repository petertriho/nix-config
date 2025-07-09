return {
    "olimorris/codecompanion.nvim",
    cmd = {
        "CodeCompanion",
    },
    keys = {
        { "<leader>ic", "<CMD>CodeCompanionCmd<CR>", desc = "Cmd" },
        { "<leader>ip", "<CMD>CodeCompanionActions<CR>", desc = "Palette" },
        {
            "<leader>it",
            "<CMD>CodeCompanionChat Toggle<CR>",
            desc = "Toggle",
        },
        { "<leader>ia", "<CMD>CodeCompanionChat Add<CR>", desc = "Add" },
    },
    opts = {
        -- display = {
        --     chat = {
        --         show_settings = true,
        --     },
        -- },
    },
    config = function(_, opts)
        if vim.g.copilot_model then
            opts = vim.tbl_deep_extend("force", opts, {
                adapters = {
                    copilot = function()
                        return require("codecompanion.adapters").extend("copilot", {
                            schema = {
                                model = {
                                    default = vim.g.copilot_model,
                                },
                            },
                        })
                    end,
                },
            })
        end

        require("codecompanion").setup(opts)
    end,
}
