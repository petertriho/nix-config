return {
    "GeorgesAlkhouri/nvim-aider",
    cmd = "Aider",
    keys = {
        { "<leader>a/", "<CMD>Aider toggle<CR>", desc = "Toggle Aider" },
        { "<leader>as", "<CMD>Aider send<CR>", desc = "Send to Aider", mode = { "n", "v" } },
        { "<leader>ac", "<CMD>Aider command<CR>", desc = "Aider Commands" },
        { "<leader>ab", "<CMD>Aider buffer<CR>", desc = "Send Buffer" },
        { "<leader>a+", "<CMD>Aider add<CR>", desc = "Add File" },
        { "<leader>a-", "<CMD>Aider drop<CR>", desc = "Drop File" },
        { "<leader>ar", "<CMD>Aider add readonly<CR>", desc = "Add Read-Only" },
        { "<leader>aR", "<CMD>Aider reset<CR>", desc = "Reset Session" },
        { "<leader>a+", "<CMD>AiderTreeAddFile<CR>", desc = "Add File from Tree to Aider", ft = "NvimTree" },
        { "<leader>a-", "<CMD>AiderTreeDropFile<CR>", desc = "Drop File from Tree from Aider", ft = "NvimTree" },
    },
    config = true,
}
