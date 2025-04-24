return {
    "bassamsdata/namu.nvim",
    opts = {
        namu_symbols = {
            enable = true,
            options = {
                row_position = "top10_right",
            },
        },
    },
    keys = {
        { "<leader>ns", "<CMD>Namu symbols<CR>", desc = "Symbols" },
        { "<leader>nw", "<CMD>Namu workspace<CR>", desc = "Workspace" },
        { "<leader>na", "<CMD>Namu watchtower<CR>", desc = "All" },
        { "<leader>nd", "<CMD>Namu diagnostics<CR>", desc = "Diagnostics" },
        { "<leader>nc", "<CMD>Namu call both<CR>", desc = "Call" },
    },
}
