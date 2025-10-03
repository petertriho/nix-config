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
                { "<leader>G", group = "hunks" },
                { "<leader>l", group = "lsp" },
                { "<leader>n", group = "notif" },
                { "<leader>t", group = "tools" },
            },
            {
                mode = { "n", "x" },
                { "<leader>a", group = "ai (sidekick)" },
                { "<leader>c", group = "ai (codecompanion)" },
                { "<leader>h", group = "hierarchy" },
                { "<leader>o", group = "ai (opencode)" },
                { "<leader>m", group = "misc" },
            },
            -- vim-abolish
            {
                mode = "n",
                {
                    { "\\c", group = "coerce" },
                    { "\\c ", desc = "space case" },
                    { "\\c-", desc = "dash-case" },
                    { "\\c.", desc = "dot.case" },
                    { "\\c_", desc = "snake_case" },
                    { "\\cc", desc = "camelCase" },
                    { "\\ck", desc = "kebab-case" },
                    { "\\cm", desc = "MixedCase" },
                    { "\\cs", desc = "snake_case" },
                    { "\\ct", desc = "Title Case" },
                    { "\\cu", desc = "SNAKE_UPPERCASE" },
                    { "\\cU", desc = "SNAKE_UPPERCASE" },
                },
            },
            -- vim-caser
            {
                mode = "n",
                {
                    { "\\C", group = "caser" },
                    { "\\C ", desc = "space case" },
                    { "\\C-", desc = "dash-case" },
                    { "\\C.", desc = "dot.case" },
                    { "\\C_", desc = "snake_case" },
                    { "\\Cc", desc = "camelCase" },
                    { "\\Ck", desc = "kebab-case" },
                    { "\\CK", desc = "Title-Kebab-Case" },
                    { "\\Cm", desc = "MixedCase" },
                    { "\\Cp", desc = "PascalCase" },
                    { "\\Cs", desc = "Sentence case" },
                    { "\\Ct", desc = "Title Case" },
                    { "\\Cu", desc = "SNAKE_UPPERCASE" },
                    { "\\CU", desc = "SNAKE_UPPERCASE" },
                },
            },
        },
    },
}
