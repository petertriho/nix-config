return {
    "olimorris/codecompanion.nvim",
    cmd = {
        "CodeCompanion",
    },
    keys = {
        { "<leader>cc", "<CMD>CodeCompanionCmd<CR>", desc = "Cmd" },
        { "<leader>cp", "<CMD>CodeCompanionActions<CR>", desc = "Palette" },
        {
            "<leader>ct",
            "<CMD>CodeCompanionChat Toggle<CR>",
            desc = "Toggle",
        },
        { "<leader>ca", "<CMD>CodeCompanionChat Add<CR>", desc = "Add" },
    },
    dependencies = {
        "franco-ruggeri/codecompanion-spinner.nvim",
    },
    opts = {
        -- display = {
        --     chat = {
        --         show_settings = true,
        --     },
        -- },
        extensions = {
            spinner = {},
        },
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
