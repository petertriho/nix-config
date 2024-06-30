return {
    "dnlhc/glance.nvim",
    cmd = "Glance",
    keys = {
        { "gpd", "<CMD>Glance definitions<CR>", desc = "definitions" },
        { "gpr", "<CMD>Glance references<CR>", desc = "references" },
        { "gpy", "<CMD>Glance type_definitions<CR>", desc = "type_definitions" },
        { "gpm", "<CMD>Glance implementations<CR>", desc = "implementations" },
        { "gD", "<CMD>Glance definitions<CR>", desc = "definitions" },
        { "gR", "<CMD>Glance references<CR>", desc = "references" },
        { "gY", "<CMD>Glance type_definitions<CR>", desc = "type_definitions" },
        { "gM", "<CMD>Glance implementations<CR>", desc = "implementations" },
    },
    config = function()
        local glance = require("glance")
        local actions = glance.actions

        glance.setup({
            height = 36,
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
