return {
    "kazhala/close-buffers.nvim",
    cmd = { "BDelete", "BWipeout" },
    keys = {
        { "<leader>.", "<CMD>BWipeout other<CR>", desc = "only-buffer" },
        { "<leader>,", "<CMD>BWipeout hidden<CR>", desc = "hidden-buffers" },
        { "<leader>x", "<CMD>BWipeout all<CR>", desc = "all-buffers" },
    },
    config = true,
}
