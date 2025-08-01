return {
    "bassamsdata/namu.nvim",
    keys = {
        { "<leader>hs", "<CMD>Namu symbols<CR>", desc = "Symbols" },
        { "<leader>hw", "<CMD>Namu workspace<CR>", desc = "Workspace" },
        { "<leader>ha", "<CMD>Namu watchtower<CR>", desc = "All" },
        { "<leader>hd", "<CMD>Namu diagnostics<CR>", desc = "Diagnostics" },
        { "<leader>hc", "<CMD>Namu call both<CR>", desc = "Call" },
    },
    config = function()
        local default_options = {
            row_position = "top5_right",
            right_position = {
                ratio = 1,
            },
        }
        require("namu").setup({
            namu_symbols = {
                enable = true,
                options = default_options,
            },
            callhierarchy = {
                enable = true,
                options = default_options,
            },
            workspace = {
                enable = true,
                options = default_options,
            },
            diagnostics = {
                enable = true,
                options = default_options,
            },
            watchtower = {
                enable = true,
                options = default_options,
            },
        })
    end,
}
