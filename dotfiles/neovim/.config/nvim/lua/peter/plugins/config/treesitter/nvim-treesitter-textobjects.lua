return {
    "nvim-treesitter/nvim-treesitter-textobjects",
    event = "User LoadedNvimTreesitter",
    config = function()
        require("nvim-treesitter.configs").setup({
            textobjects = {
                select = {
                    enable = true,
                    lookahead = true,
                    keymaps = {
                        ["a/"] = { query = "@comment.outer", desc = "Comment" },
                        ["i/"] = { query = "@comment.inner", desc = "Comment" },
                        ["a?"] = { query = "@conditional.outer", desc = "Conditional" },
                        ["i?"] = { query = "@conditional.inner", desc = "Conditional" },
                        ["aB"] = { query = "@block.outer", desc = "Block" },
                        ["iB"] = { query = "@block.inner", desc = "Block" },
                        ["aC"] = { query = "@class.outer", desc = "Class" },
                        ["iC"] = { query = "@class.inner", desc = "Class" },
                        ["aP"] = { query = "@parameter.outer", desc = "Parameter" },
                        ["iP"] = { query = "@parameter.inner", desc = "Parameter" },
                        ["aS"] = { query = "@statement.outer", desc = "Statement" },
                        ["iS"] = { query = "@statement.inner", desc = "Statement" },
                        ["ac"] = { query = "@call.outer", desc = "Call" },
                        ["ic"] = { query = "@call.inner", desc = "Call" },
                        ["af"] = { query = "@function.outer", desc = "Function" },
                        ["if"] = { query = "@function.inner", desc = "Function" },
                        ["ao"] = { query = "@loop.outer", desc = "Loop" },
                        ["io"] = { query = "@loop.inner", desc = "Loop" },
                    },
                },
                move = {
                    enable = true,
                    set_jumps = true,
                    goto_next_start = {
                        ["]f"] = { query = "@function.outer", desc = "Next function start" },
                        ["]c"] = { query = "@class.outer", desc = "Next class start" },
                    },
                    goto_next_end = {
                        ["]F"] = { query = "@function.outer", desc = "Next function end" },
                        ["]C"] = { query = "@class.outer", desc = "Next class end" },
                    },
                    goto_previous_start = {
                        ["[f"] = { query = "@function.outer", desc = "Previous function start" },
                        ["[c"] = { query = "@class.outer", desc = "Previous class start" },
                    },
                    goto_previous_end = {
                        ["[F"] = { query = "@function.outer", desc = "Previous function end" },
                        ["[C"] = { query = "@class.outer", desc = "Previous class end" },
                    },
                },
            },
        })
    end,
}
