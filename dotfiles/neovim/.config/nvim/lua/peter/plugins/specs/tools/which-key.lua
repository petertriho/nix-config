return {
    "folke/which-key.nvim",
    event = "VeryLazy",
    opts = function()
        local leader_nx = {
            mode = { "n", "x" },
            { "<leader>a", group = "ai" },
            { "<leader>j", group = "jump" },
        }
        local spec = {
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
                { "<leader>b", group = "buffer" },
                { "<leader>c", group = "code" },
                { "<leader>g", group = "git" },
                { "<leader>i", group = "insert" },
                { "<leader>l", group = "lsp" },
                { "<leader>L", group = "lspc" },
                { "<leader>lc", group = "calls" },
                { "<leader>n", group = "notif" },
                { "<leader>q", group = "query" },
                { "<leader>R", group = "rulebook" },
                { "<leader>t", group = "tools" },
                { "<leader>u", group = "ui" },
            },
            leader_nx,
            -- coerce.nvim
            {
                { "cr", group = "coerce" },
                { "co", group = "coerce (no lsp)" },
                { "\\c", group = "coerce motion" },
                { "\\c", group = "coerce selection", mode = "x" },
            },
        }

        if os.getenv("OBSIDIAN_VAULTS") ~= nil then
            table.insert(leader_nx, { "<leader>o", group = "obsidian" })
        end

        return {
            preset = "helix",
            win = {
                title_pos = "center",
            },
            layout = {
                align = "center",
            },
            spec = spec,
        }
    end,
}
