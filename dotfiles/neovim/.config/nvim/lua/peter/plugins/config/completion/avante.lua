return {
    "yetone/avante.nvim",
    event = { "User LazyLoadFile", "VeryLazy" },
    build = "make",
    dependencies = {
        "stevearc/dressing.nvim",
        "MunifTanjim/nui.nvim",
        {
            "zbirenbaum/copilot.lua",
            opts = {
                panel = {
                    enabled = false,
                },
                suggestion = {
                    enabled = false,
                },
            },
        },
    },
    opts = {
        provider = "copilot",
        auto_suggestion_provider = "copilot",
        copilot = {
            model = "claude-3.5-sonnet",
        },
    },
}
