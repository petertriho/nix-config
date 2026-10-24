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
        }

        -- coerce.nvim: mirrors require("coerce").default_cases
        local coerce_cases = {
            { "c", "camelCase" },
            { "d", "dot.case" },
            { "k", "kebab-case" },
            { "n", "numeronym (n7m)" },
            { "p", "PascalCase" },
            { "s", "snake_case" },
            { "u", "UPPER_CASE" },
            { "/", "path/case" },
            { " ", "space case" },
        }
        for _, prefix in ipairs({
            { "cR", "n", "coerce" },
            { "co", "n", "coerce (no lsp)" },
            { "gcR", "n", "coerce motion" },
            { "gcR", "x", "coerce selection" },
        }) do
            local lhs, mode, group = unpack(prefix)
            local entries = { mode = mode, { lhs, group = group } }
            for _, case in ipairs(coerce_cases) do
                table.insert(entries, { lhs .. case[1], desc = case[2] })
            end
            table.insert(spec, entries)
        end

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
