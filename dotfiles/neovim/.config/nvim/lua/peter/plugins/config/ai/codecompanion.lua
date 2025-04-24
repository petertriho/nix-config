return {
    "olimorris/codecompanion.nvim",
    config = function()
        require("codecompanion").setup({
            adapters = {
                copilot = function()
                    return require("codecompanion.adapters").extend("copilot", {
                        schema = {
                            model = {
                                default = "gemini-2.5-pro",
                            },
                        },
                    })
                end,
            },
            display = {
                chat = {
                    show_settings = true,
                },
            },
        })
    end,
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
}
