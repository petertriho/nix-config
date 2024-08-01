return {
    "kazhala/close-buffers.nvim",
    cmd = { "BDelete", "BWipeout" },
    keys = {
        { "<leader>.", "<CMD>BWipeout other<CR>", desc = "Only Buffer" },
        { "<leader>,", "<CMD>BWipeout hidden<CR>", desc = "Hidden Buffers" },
        { "<leader>D", "<CMD>BWipeout all<CR>", desc = "All Buffers" },
    },
    config = true,
}
