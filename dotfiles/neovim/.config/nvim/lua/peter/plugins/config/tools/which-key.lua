return {
    "folke/which-key.nvim",
    config = function()
        require("which-key").setup({
            layout = {
                align = "center",
            },
        })

        local leader_keymaps = {
            ["1"] = "which_key_ignore",
            ["2"] = "which_key_ignore",
            ["3"] = "which_key_ignore",
            ["4"] = "which_key_ignore",
            ["5"] = "which_key_ignore",
            ["6"] = "which_key_ignore",
            ["7"] = "which_key_ignore",
            ["8"] = "which_key_ignore",
            ["9"] = "which_key_ignore",
            ["0"] = "which_key_ignore",
            a = {
                name = "+actions",
            },
            g = {
                name = "+git",
            },
            l = {
                name = "+lsp",
                e = {
                    name = "+errors",
                },
                s = {
                    name = "+symbols",
                },
            },
            m = {
                name = "+marks",
            },
            w = {
                name = "+workspace",
            },
        }

        local leader_visual_keymaps = {
            a = {
                name = "+actions",
            },
        }

        local register = require("which-key").register
        register(leader_keymaps, {
            prefix = "<leader>",
            mode = "n",
            silent = true,
            noremap = true,
        })

        register(leader_visual_keymaps, {
            prefix = "<leader>",
            mode = "x",
            silent = true,
            noremap = true,
        })

        -- vim-abolish
        register({
            name = "coerce",
            [" "] = "space case",
            ["-"] = "dash-case",
            ["."] = "dot.case",
            ["_"] = "snake_case",
            c = "camelCase",
            k = "kebab-case",
            m = "MixedCase",
            s = "snake_case",
            t = "Title Case",
            u = "SNAKE_UPPERCASE",
            U = "SNAKE_UPPERCASE",
        }, {
            prefix = "cr",
            mode = "n",
        })

        -- vim-caser
        register({
            name = "caser",
            [" "] = "space case",
            ["-"] = "dash-case",
            ["."] = "dot.case",
            ["_"] = "snake_case",
            c = "camelCase",
            k = "kebab-case",
            K = "Title-Kebab-Case",
            m = "MixedCase",
            p = "PascalCase",
            s = "Sentence case",
            t = "Title Case",
            u = "SNAKE_UPPERCASE",
            U = "SNAKE_UPPERCASE",
        }, {
            prefix = "cC",
            mode = "n",
        })
    end,
}
