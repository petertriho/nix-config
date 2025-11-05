return {
    "nvim-neo-tree/neo-tree.nvim",
    dependencies = {
        "nvim-lua/plenary.nvim",
        "MunifTanjim/nui.nvim",
        "s1n7ax/nvim-window-picker",
    },
    keys = {
        {
            "<leader>e",
            "<CMD>Neotree toggle<CR>",
            desc = "Explorer",
        },
    },
    opts = {
        filesystem = {
            filtered_items = {
                hide_dotfiles = false,
                hide_gitignored = true,
                hide_ignored = true,
            },
            use_libuv_file_watcher = true,
            follow_current_file = {
                enabled = true,
            },
        },
    },
    config = function(_, opts)
        local function on_move(data)
            require("snacks").rename.on_rename_file(data.source, data.destination)
        end
        local events = require("neo-tree.events")
        opts.event_handlers = opts.event_handlers or {}
        vim.list_extend(opts.event_handlers, {
            { event = events.FILE_MOVED, handler = on_move },
            { event = events.FILE_RENAMED, handler = on_move },
        })
        require("neo-tree").setup(opts)
    end,
}
