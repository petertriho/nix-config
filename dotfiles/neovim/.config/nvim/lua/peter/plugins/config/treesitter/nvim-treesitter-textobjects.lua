return {
    "nvim-treesitter/nvim-treesitter-textobjects",
    branch = "main",
    event = "User LoadedNvimTreesitter",
    config = function()
        require("nvim-treesitter-textobjects").setup({
            select = {
                lookahead = true,
            },
            move = {
                set_jumps = true,
            },
        })

        local select = require("nvim-treesitter-textobjects.select")
        local select_keymaps = {
            { key = "a/", query = "@comment.outer", desc = "Comment" },
            { key = "i/", query = "@comment.inner", desc = "Comment" },
            { key = "a?", query = "@conditional.outer", desc = "Conditional" },
            { key = "i?", query = "@conditional.inner", desc = "Conditional" },
            { key = "aB", query = "@block.outer", desc = "Block" },
            { key = "iB", query = "@block.inner", desc = "Block" },
            { key = "aC", query = "@class.outer", desc = "Class" },
            { key = "iC", query = "@class.inner", desc = "Class" },
            { key = "aP", query = "@parameter.outer", desc = "Parameter" },
            { key = "iP", query = "@parameter.inner", desc = "Parameter" },
            { key = "aS", query = "@statement.outer", desc = "Statement" },
            { key = "iS", query = "@statement.inner", desc = "Statement" },
            { key = "ac", query = "@call.outer", desc = "Call" },
            { key = "ic", query = "@call.inner", desc = "Call" },
            { key = "af", query = "@function.outer", desc = "Function" },
            { key = "if", query = "@function.inner", desc = "Function" },
            { key = "ao", query = "@loop.outer", desc = "Loop" },
            { key = "io", query = "@loop.inner", desc = "Loop" },
        }
        for _, keymap in ipairs(select_keymaps) do
            vim.keymap.set({ "x", "o" }, keymap.key, function()
                select.select_textobject(keymap.query, "textobjects")
            end, { desc = keymap.desc })
        end

        local move = require("nvim-treesitter-textobjects.move")
        local move_keymaps = {
            { key = "[c", func = "goto_previous_start", query = "@class.outer", desc = "Previous class start" },
            { key = "]c", func = "goto_next_start", query = "@class.outer", desc = "Next class start" },
            { key = "[C", func = "goto_previous_end", query = "@class.outer", desc = "Previous class end" },
            { key = "]C", func = "goto_next_end", query = "@class.outer", desc = "Next class end" },
            { key = "[f", func = "goto_previous_start", query = "@function.outer", desc = "Previous function start" },
            { key = "]f", func = "goto_next_start", query = "@function.outer", desc = "Next function start" },
            { key = "[F", func = "goto_previous_end", query = "@function.outer", desc = "Previous function end" },
            { key = "]F", func = "goto_next_end", query = "@function.outer", desc = "Next function end" },
        }
        for _, keymap in ipairs(move_keymaps) do
            vim.keymap.set({ "n", "x", "o" }, keymap.key, function()
                move[keymap.func](keymap.query, "textobjects")
            end, { desc = keymap.desc })
        end
    end,
}
