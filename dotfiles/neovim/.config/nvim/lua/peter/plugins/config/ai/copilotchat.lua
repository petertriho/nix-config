return {
    "CopilotC-Nvim/CopilotChat.nvim",
    build = "make tiktoken",
    event = { "User LazyLoadFile", "VeryLazy" },
    keys = {
        { "<leader>io", "<CMD>CopilotChatOpen<CR>", desc = "Open" },
        {
            "<leader>ic",
            "<CMD>CopilotChatClose<CR>",
            desc = "Close",
        },
        {
            "<leader>it",
            "<CMD>CopilotChatToggle<CR>",
            desc = "Toggle",
        },
        {
            "<leader>is",
            "<CMD>CopilotChatStop<CR>",
            desc = "Stop",
        },
        { "<leader>ir", "<CMD>CopilotChatReset<CR>", desc = "Reset" },
        { "<leader>ip", "<CMD>CopilotChatPrompts<CR>", desc = "Prompts" },
        { "<leader>im", "<CMD>CopilotChatModels<CR>", desc = "Models" },
        { "<leader>ia", "<CMD>CopilotChatAgents<CR>", desc = "Agents" },
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
