return {
    "zbirenbaum/copilot.lua",
    enabled = function()
        return vim.g.copilot_model ~= nil
    end,
    cmd = "Copilot",
    -- event = "InsertEnter",
    opts = {
        panel = {
            enabled = false,
            auto_refresh = false,
            keymap = {
                accept = "<CR>",
                jump_next = "<M-]>",
                jump_prev = "<M-[>",
                open = "<M-CR>",
                refresh = "<C-r>",
            },
        },
        suggestion = {
            enabled = false,
            -- auto_trigger = vim.g.copilot_model ~= nil,
            auto_trigger = false,
            keymap = {
                accept = "<C-e>",
                accept_line = false,
                accept_word = false,
                dismiss = "<C-CR>",
                next = "<M-]>",
                prev = "<M-[>",
            },
        },
        filetypes = {
            ["*"] = false,
        },
    },
}
