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
                    ["<leader>-"] = actions.jump_split,
                    ["<leader>\\"] = actions.jump_vsplit,
                    ["<C-j>"] = actions.next,
                    ["<C-k>"] = actions.previous,
                    ["<C-h>"] = actions.enter_win("preview"),
                    ["<C-l>"] = actions.enter_win("list"),
                    ["<leader>l"] = "<leader>l",
                    ["s"] = "s",
                    ["v"] = "v",
                },
                preview = {
                    ["<leader>-"] = actions.jump_split,
                    ["<leader>\\"] = actions.jump_vsplit,
                    ["<C-j>"] = actions.next,
                    ["<C-k>"] = actions.previous,
                    ["<C-h>"] = actions.enter_win("preview"),
                    ["<C-l>"] = actions.enter_win("list"),
                    ["<leader>l"] = "<leader>l",
                },
            },
            folds = {
                folded = false,
            },
        })
    end,
}
