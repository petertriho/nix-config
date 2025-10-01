return {
    "folke/sidekick.nvim",
    enabled = function()
        return vim.g.copilot_model ~= nil
    end,
    event = "InsertEnter",
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
    },
    config = function(_, opts)
        vim.lsp.config("copilot", {
            telemetry = {
                telemetryLevel = "off",
            },
        })
        vim.lsp.enable("copilot")
        require("sidekick").setup(opts)
    end,
}
