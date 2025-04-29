return {
    "CopilotC-Nvim/CopilotChat.nvim",
    build = "make tiktoken",
    event = { "User LazyLoadFile", "VeryLazy" },
    keys = {
        { "<leader>co", "<CMD>CopilotChatOpen<CR>", desc = "Open" },
        {
            "<leader>cc",
            "<CMD>CopilotChatClose<CR>",
            desc = "Close",
        },
        {
            "<leader>ct",
            "<CMD>CopilotChatToggle<CR>",
            desc = "Toggle",
        },
        {
            "<leader>cs",
            "<CMD>CopilotChatStop<CR>",
            desc = "Stop",
        },
        { "<leader>cr", "<CMD>CopilotChatReset<CR>", desc = "Reset" },
        { "<leader>cp", "<CMD>CopilotChatPrompts<CR>", desc = "Prompts" },
        { "<leader>cm", "<CMD>CopilotChatModels<CR>", desc = "Models" },
        { "<leader>ca", "<CMD>CopilotChatAgents<CR>", desc = "Agents" },
    },
    opts = {
        mappings = {
            reset = {
                normal = "<C-e>",
                insert = "<C-e>",
            },
        },
    },
    config = function(_, opts)
        if vim.g.copilot_model then
            opts = vim.tbl_deep_extend("force", opts, {
                model = vim.g.copilot_model,
            })
        end

        require("CopilotChat").setup(opts)
    end,
}
