return {
    "yetone/avante.nvim",
    event = { "User LazyLoadFile", "VeryLazy" },
    build = "make",
    dependencies = {
        -- {
        --     "stevearc/dressing.nvim",
        --     opts = {
        --         input = {
        --             enabled = false,
        --         },
        --         select = {
        --             enabled = false,
        --         },
        --     },
        -- },
        "MunifTanjim/nui.nvim",
    },
    opts = {
        provider = "copilot",
        auto_suggestion_provider = "claude",
        copilot = {
            model = "claude-3.5-sonnet",
        },
        behaviour = {
            auto_suggestions = false,
        },
        -- mappings = {
        --     suggestion = {
        --         accept = "<C-e>",
        --         dismiss = "<C-CR>",
        --     },
        -- },
    },
}
