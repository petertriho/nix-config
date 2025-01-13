return {
    "folke/which-key.nvim",
    event = "VeryLazy",
    opts = {
        preset = "helix",
        win = {
            title_pos = "center",
        },
        layout = {
            align = "center",
        },
        spec = {
            -- overrides
            {
                "gx",
                desc = "Open",
            },
            -- leader
            {
                mode = "n",
                { "<leader>1", hidden = true },
                { "<leader>2", hidden = true },
                { "<leader>3", hidden = true },
                { "<leader>4", hidden = true },
                { "<leader>5", hidden = true },
                { "<leader>6", hidden = true },
                { "<leader>7", hidden = true },
                { "<leader>8", hidden = true },
                { "<leader>9", hidden = true },
                { "<leader>0", hidden = true },
                { "<leader>g", group = "git" },
                { "<leader>h", group = "hunks" },
                { "<leader>l", group = "lsp" },
                { "<leader>t", group = "tools" },
            },
            {
                mode = { "n", "x" },
                { "<leader>a", group = "ai" },
                { "<leader>o", group = "operations" },
            },
            -- vim-abolish
            {
                mode = "n",
                {
                    { "<leader>c", group = "coerce" },
                    { "<leader>c ", desc = "space case" },
                    { "<leader>c-", desc = "dash-case" },
                    { "<leader>c.", desc = "dot.case" },
                    { "<leader>c_", desc = "snake_case" },
                    { "<leader>cc", desc = "camelCase" },
                    { "<leader>ck", desc = "kebab-case" },
                    { "<leader>cm", desc = "MixedCase" },
                    { "<leader>cs", desc = "snake_case" },
                    { "<leader>ct", desc = "Title Case" },
                    { "<leader>cu", desc = "SNAKE_UPPERCASE" },
                    { "<leader>cU", desc = "SNAKE_UPPERCASE" },
                },
            },
            -- vim-caser
            {
                mode = "n",
                {
                    { "<leader>C", group = "caser" },
                    { "<leader>C ", desc = "space case" },
                    { "<leader>C-", desc = "dash-case" },
                    { "<leader>C.", desc = "dot.case" },
                    { "<leader>C_", desc = "snake_case" },
                    { "<leader>Cc", desc = "camelCase" },
                    { "<leader>Ck", desc = "kebab-case" },
                    { "<leader>CK", desc = "Title-Kebab-Case" },
                    { "<leader>Cm", desc = "MixedCase" },
                    { "<leader>Cp", desc = "PascalCase" },
                    { "<leader>Cs", desc = "Sentence case" },
                    { "<leader>Ct", desc = "Title Case" },
                    { "<leader>Cu", desc = "SNAKE_UPPERCASE" },
                    { "<leader>CU", desc = "SNAKE_UPPERCASE" },
                },
            },
        },
    },
}
