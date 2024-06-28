return {
    "dnlhc/glance.nvim",
    cmd = "Glance",
    init = function()
        local keymap = vim.keymap.set

        keymap("n", "gpd", "<CMD>Glance definitions<CR>")
        keymap("n", "gpr", "<CMD>Glance references<CR>")
        keymap("n", "gpy", "<CMD>Glance type_definitions<CR>")
        keymap("n", "gpm", "<CMD>Glance implementations<CR>")

        keymap("n", "gD", "<CMD>Glance definitions<CR>")
        keymap("n", "gR", "<CMD>Glance references<CR>")
        keymap("n", "gY", "<CMD>Glance type_definitions<CR>")
        keymap("n", "gM", "<CMD>Glance implementations<CR>")
    end,
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
