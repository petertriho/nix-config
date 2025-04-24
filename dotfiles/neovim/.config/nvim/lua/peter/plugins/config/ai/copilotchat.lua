return {
    "CopilotC-Nvim/CopilotChat.nvim",
    build = "make tiktoken",
    event = { "User LazyLoadFile", "VeryLazy" },
    keys = {
        { "<leader>Io", "<CMD>CopilotChatOpen<CR>", desc = "Open" },
        {
            "<leader>Ic",
            "<CMD>CopilotChatClose<CR>",
            desc = "Close",
        },
        {
            "<leader>It",
            "<CMD>CopilotChatToggle<CR>",
            desc = "Toggle",
        },
        {
            "<leader>Is",
            "<CMD>CopilotChatStop<CR>",
            desc = "Stop",
        },
        { "<leader>Ir", "<CMD>CopilotChatReset<CR>", desc = "Reset" },
        { "<leader>Ip", "<CMD>CopilotChatPrompts<CR>", desc = "Prompts" },
        { "<leader>Im", "<CMD>CopilotChatModels<CR>", desc = "Models" },
        { "<leader>Ia", "<CMD>CopilotChatAgents<CR>", desc = "Agents" },
    },
    opts = {
        model = "gemini-2.5-pro",
        mappings = {
            reset = {
                normal = "<C-e>",
                insert = "<C-e>",
            },
        },
    },
}
