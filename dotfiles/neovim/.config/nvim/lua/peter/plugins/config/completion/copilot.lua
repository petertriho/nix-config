return {
    "zbirenbaum/copilot.lua",
    cmd = "Copilot",
    event = "InsertEnter",
    opts = {
        panel = {
            auto_refresh = true,
            keymap = {
                accept = "<CR>",
                jump_next = "<M-]>",
                jump_prev = "<M-[>",
                open = "<M-CR>",
                refresh = "<C-r>",
            },
        },
        suggestion = {
            auto_trigger = vim.g.copilot_model ~= nil,
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
            ["*"] = true,
        },
    },
}
