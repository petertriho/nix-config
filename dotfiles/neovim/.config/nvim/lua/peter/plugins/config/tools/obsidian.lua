return {
    "obsidian-nvim/obsidian.nvim",
    enabled = os.getenv("OBSIDIAN_VAULTS") ~= nil,
    cmd = { "Obsidian" },
    ft = "markdown",
    keys = {
        { "<leader>ot", "<CMD>Obsidian tags<CR>", desc = "Tags" },
        { "<leader>on", "<CMD>Obsidian new<CR>", desc = "New" },
        { "<leader>oq", "<CMD>Obsidian quick_switch<CR>", desc = "Quick switch" },
        { "<leader>oN", "<CMD>Obsidian new_from_template<CR>", desc = "New from template" },
        { "<leader>ow", "<CMD>Obsidian workspace<CR>", desc = "Workspace" },
        { "<leader>oy", "<CMD>Obsidian yesterday<CR>", desc = "Yesterday" },
        { "<leader>om", "<CMD>Obsidian tomorrow<CR>", desc = "Tomorrow" },
        { "<leader>oc", "<CMD>Obsidian check<CR>", desc = "Check" },
        { "<leader>os", "<CMD>Obsidian search<CR>", desc = "Search" },
        { "<leader>od", "<CMD>Obsidian dailies<CR>", desc = "Dailies" },
        { "<leader>oo", "<CMD>Obsidian open<CR>", desc = "Open" },
        { "<leader>oT", "<CMD>Obsidian today<CR>", desc = "Today" },
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
