return {
    "folke/noice.nvim",
    event = "VeryLazy",
    keys = {
        {
            "<leader>nd",
            "<CMD>Noice dismiss<CR>",
            desc = "Dismiss",
        },
        {
            "<leader>ne",
            "<CMD>Noice errors<CR>",
            desc = "Errors",
        },
        {
            "<leader>nl",
            "<CMD>Noice last<CR>",
            desc = "Last Message",
        },
        {
            "<leader>nm",
            "<CMD>Noice history<CR>",
            desc = "Messages",
        },
        {
            "<leader>ns",
            "<CMD>Noice snacks<CR>",
            desc = "Snacks",
        },
    },
    dependencies = {
        "MunifTanjim/nui.nvim",
    },
    init = function()
        vim.opt.cmdheight = 0
    end,
    opts = {
        cmdline = {
            view = "cmdline",
        },
        lsp = {
            progress = {
                enabled = false,
            },
        },
        presets = {
            -- command_palette = true,
            long_message_to_split = true,
            lsp_doc_border = true,
        },
    },
}
