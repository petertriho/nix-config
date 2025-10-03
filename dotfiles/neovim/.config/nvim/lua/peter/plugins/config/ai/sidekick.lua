return {
    "folke/sidekick.nvim",
    event = { "User LazyLoadFile", "VeryLazy" },
    cmd = {
        "LspCopilotLogin",
        "Sidekick",
    },
    keys = {
        {
            "<Tab>",
            function()
                if not require("sidekick").nes_jump_or_apply() then
                    return "<Tab>"
                end
            end,
            desc = "Copilot NES",
            expr = true,
            mode = { "n" },
        },
        {
            "<C-.>",
            function()
                require("sidekick.cli").focus()
            end,
            mode = { "n", "x", "i", "t" },
            desc = "Sidekick Focus",
        },
        {
            "<leader>aa",
            function()
                require("sidekick.cli").toggle({ filter = { installed = true } })
            end,
            desc = "Toggle",
        },
        {
            "<leader>ab",
            function()
                require("sidekick.cli").send({ msg = "{buffers}" })
            end,
            mode = { "n", "x" },
            desc = "Send Buffers",
        },
        {
            "<leader>af",
            function()
                require("sidekick.cli").send({ msg = "{file}" })
            end,
            mode = { "n", "x" },
            desc = "Send File",
        },
        {
            "<leader>ap",
            function()
                require("sidekick.cli").prompt()
            end,
            mode = { "n", "x" },
            desc = "Prompt",
        },
        {
            "<leader>as",
            function()
                require("sidekick.cli").send({ msg = "{this}" })
            end,
            mode = { "n", "x" },
            desc = "Send This",
        },
        {
            "<leader>as",
            function()
                require("sidekick.cli").send({ msg = "{selection}" })
            end,
            mode = { "x" },
            desc = "Send Visual Selection",
        },
        {
            "<leader>ac",
            function()
                require("sidekick.cli").toggle({ name = "copilot", focus = true })
            end,
            desc = "Copilot",
        },
        {
            "<leader>ag",
            function()
                require("sidekick.cli").toggle({ name = "gemini", focus = true })
            end,
            desc = "Gemini",
        },
        {
            "<leader>ao",
            function()
                require("sidekick.cli").toggle({ name = "opencode", focus = true })
            end,
            desc = "Opencode",
        },
        {
            "<leader>aq",
            function()
                require("sidekick.cli").toggle({ name = "amazon_q", focus = true })
            end,
            desc = "AmazonQ",
        },
    },
    opts = {
        cli = {
            mux = {
                backend = "tmux",
                enabled = false,
            },
            tools = {
                amazon_q = { cmd = { "amazon-q" } },
            },
        },
        nes = {
            enabled = false,
        },
    },
    config = function(_, opts)
        if vim.g.copilot_model then
            opts.nes.enabled = true

            vim.lsp.config("copilot", {
                telemetry = {
                    telemetryLevel = "off",
                },
            })
            vim.lsp.enable("copilot")
        end

        require("sidekick").setup(opts)
    end,
}
