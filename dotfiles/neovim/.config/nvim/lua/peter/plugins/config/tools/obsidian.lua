return {
    "obsidian-nvim/obsidian.nvim",
    cmd = { "Obsidian" },
    ft = "markdown",
    keys = {
        { "<leader>ot", "<cmd>Obsidian tags<cr>", desc = "Tags" },
        { "<leader>on", "<cmd>Obsidian new<cr>", desc = "New" },
        { "<leader>oq", "<cmd>Obsidian quick_switch<cr>", desc = "Quick switch" },
        { "<leader>oN", "<cmd>Obsidian new_from_template<cr>", desc = "New from template" },
        { "<leader>ow", "<cmd>Obsidian workspace<cr>", desc = "Workspace" },
        { "<leader>oy", "<cmd>Obsidian yesterday<cr>", desc = "Yesterday" },
        { "<leader>om", "<cmd>Obsidian tomorrow<cr>", desc = "Tomorrow" },
        { "<leader>oc", "<cmd>Obsidian check<cr>", desc = "Check" },
        { "<leader>os", "<cmd>Obsidian search<cr>", desc = "Search" },
        { "<leader>od", "<cmd>Obsidian dailies<cr>", desc = "Dailies" },
        { "<leader>oo", "<cmd>Obsidian open<cr>", desc = "Open" },
        { "<leader>oT", "<cmd>Obsidian today<cr>", desc = "Today" },
    },
    opts = {
        legacy_commands = false,
    },
    config = function(_, opts)
        opts.workspaces = opts.workspaces or {}
        local obsidian_vaults = os.getenv("OBSIDIAN_VAULTS")
        if obsidian_vaults then
            for path in string.gmatch(obsidian_vaults, "[^:]+") do
                local name = path:match("([^/]+)$")
                if name then
                    table.insert(opts.workspaces, {
                        name = name,
                        path = path,
                    })
                end
            end
        end

        require("obsidian").setup(opts)
    end,
}
