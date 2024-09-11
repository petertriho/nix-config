return {
    "dnlhc/glance.nvim",
    cmd = "Glance",
    keys = {
        { "gD", "<CMD>Glance definitions<CR>", desc = "Definitions" },
        { "gR", "<CMD>Glance references<CR>", desc = "References" },
        { "gY", "<CMD>Glance type_definitions<CR>", desc = "Type Definitions" },
        { "gM", "<CMD>Glance implementations<CR>", desc = "Implementations" },
    },
    config = function()
        local glance = require("glance")
        local actions = glance.actions

        glance.setup({
            height = 36,
            theme = {
                mode = "darken",
            },
            mappings = {
                list = {
                    ["\\"] = actions.jump_vsplit,
                    ["-"] = actions.jump_split,
                    ["s"] = "<Plug>(leap-forward-to)",
                    ["v"] = "v",
                    ["gp"] = actions.enter_win("preview"),
                    ["<leader>l"] = "<leader>l",
                },
                preview = {
                    ["gp"] = actions.enter_win("list"),
                    ["<leader>l"] = "<leader>l",
                },
            },
            folds = {
                folded = false,
            },
        })
    end,
}
