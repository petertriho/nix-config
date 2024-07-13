return {
    "folke/which-key.nvim",
    event = "VeryLazy",
    opts = {
        preset = "classic",
        layout = {
            align = "center",
        },
        spec = {
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
                { "<leader>a", group = "actions" },
                { "<leader>g", group = "git" },
                { "<leader>m", group = "marks" },
                { "<leader>l", group = "lsp" },
                { "<leader>le", group = "errors" },
                { "<leader>ls", group = "symbols" },
                { "<leader>t", group = "telescope" },
            },
            { mode = "x", { "<leader>a", "actions" } },
            -- nvim-treesitter-textsubjects
            {
                mode = "o",
                {
                    { ".", desc = "textsubjects-smart" },
                    { "<CR>", desc = "textsubjects-container-outer" },
                    { "i<CR>", desc = "textsubjects-container-inner" },
                },
            },
            -- vim-abolish
            {
                mode = "n",
                {
                    { "cr", group = "coerce" },
                    { "cr ", desc = "space case" },
                    { "cr-", desc = "dash-case" },
                    { "cr.", desc = "dot.case" },
                    { "cr_", desc = "snake_case" },
                    { "crc", desc = "camelCase" },
                    { "crk", desc = "kebab-case" },
                    { "crm", desc = "MixedCase" },
                    { "crs", desc = "snake_case" },
                    { "crt", desc = "Title Case" },
                    { "cru", desc = "SNAKE_UPPERCASE" },
                    { "crU", desc = "SNAKE_UPPERCASE" },
                },
            },
            -- vim-caser
            {
                mode = "n",
                {
                    { "cC", group = "caser" },
                    { "cC ", desc = "space case" },
                    { "cC-", desc = "dash-case" },
                    { "cC.", desc = "dot.case" },
                    { "cC_", desc = "snake_case" },
                    { "cCc", desc = "camelCase" },
                    { "cCk", desc = "kebab-case" },
                    { "cCK", desc = "Title-Kebab-Case" },
                    { "cCm", desc = "MixedCase" },
                    { "cCp", desc = "PascalCase" },
                    { "cCs", desc = "Sentence case" },
                    { "cCt", desc = "Title Case" },
                    { "cCu", desc = "SNAKE_UPPERCASE" },
                    { "cCU", desc = "SNAKE_UPPERCASE" },
                },
            },
        },
    },
}
