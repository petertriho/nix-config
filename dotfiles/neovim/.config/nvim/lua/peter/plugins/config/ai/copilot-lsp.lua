return {
    "copilotlsp-nvim/copilot-lsp",
    enabled = function()
        return vim.g.copilot_model ~= nil
    end,
    -- event = { "User LazyLoadFile", "VeryLazy" },
    event = "InsertEnter",
    keys = {
        {
            "<Tab>",
            function()
                local bufnr = vim.api.nvim_get_current_buf()
                local state = vim.b[bufnr].nes_state
                if state then
                    local _ = require("copilot-lsp.nes").walk_cursor_start_edit()
                        or (
                            require("copilot-lsp.nes").apply_pending_nes()
                            and require("copilot-lsp.nes").walk_cursor_end_edit()
                        )
                    return nil
                else
                    return "<C-i>"
                end
            end,
            desc = "Copilot NES",
            expr = true,
            mode = { "n" },
        },
    },
    init = function()
        vim.g.copilot_nes_debounce = 500
    end,
    config = function()
        vim.lsp.enable("copilot_ls")
    end,
}
