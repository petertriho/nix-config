return {
    "sudo-tee/opencode.nvim",
    enabled = false,
    keys = {
        { "<leader>og", "<CMD>Opencode<CR>", desc = "toggle" },
        { "<leader>oi", "<CMD>OpencodeOpenInput<CR>", desc = "input" },
        { "<leader>oI", "<CMD>OpencodeOpenInputNewSession<CR>", desc = "new" },
        { "<leader>oo", "<CMD>OpencodeOpenOutput<CR>", desc = "output" },
        { "<leader>ot", "<CMD>OpencodeToggleFocus<CR>", desc = "toggle focus" },
        { "<leader>oq", "<CMD>OpencodeClose<CR>", desc = "close" },
        { "<leader>of", "<CMD>OpencodeToggleFullscreen<CR>", desc = "fullscreen" },
        { "<leader>os", "<CMD>OpencodeSelectSession<CR>", desc = "select session" },
        { "<leader>op", "<CMD>OpencodeConfigureProvider<CR>", desc = "configure provider" },
        { "<leader>od", "<CMD>OpencodeDiff<CR>", desc = "diff open" },
        { "<leader>o]", "<CMD>OpencodeDiffNext<CR>", desc = "diff next" },
        { "<leader>o[", "<CMD>OpencodeDiffPrev<CR>", desc = "diff prev" },
        { "<leader>oc", "<CMD>OpencodeDiffClose<CR>", desc = "diff close" },
        { "<leader>ora", "<CMD>OpencodeRevertAll<CR>", desc = "revert all" },
        { "<leader>ort", "<CMD>OpencodeRevertThis<CR>", desc = "revert this" },
        { "<leader>oC", "<CMD>OpencodeConfigFile<CR>", desc = "config file" },
    },
    config = function()
        require("opencode").setup({})
    end,
}
