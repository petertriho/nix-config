return {
    "yetone/avante.nvim",
    event = { "User LazyLoadFile", "VeryLazy" },
    keys = {
        { "<leader>aC", "<CMD>AvanteClear<CR>", desc = "Avante Clear" },
    },
    build = "make",
    dependencies = {
        {
            "stevearc/dressing.nvim",
            opts = {
                input = {
                    enabled = false,
                },
                select = {
                    enabled = false,
                },
            },
        },
        "MunifTanjim/nui.nvim",
    },
    opts = {
        provider = "copilot",
        behaviour = {
            auto_suggestions = false,
        },
        mode = "legacy",
        disabled_tools = {
            "python",
        },
    },
    config = function(_, opts)
        if vim.g.copilot_model then
            opts = vim.tbl_deep_extend("force", opts, {
                copilot = {
                    model = vim.g.copilot_model,
                },
            })
        end

        require("avante").setup(opts)
    end,
}
