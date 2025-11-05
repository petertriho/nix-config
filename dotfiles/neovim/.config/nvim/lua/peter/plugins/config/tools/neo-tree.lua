return {
    "nvim-neo-tree/neo-tree.nvim",
    dependencies = {
        "nvim-lua/plenary.nvim",
        "MunifTanjim/nui.nvim",
        {
            "s1n7ax/nvim-window-picker",
            opts = {
                hint = "statusline-winbar",
                picker_config = {
                    statusline_winbar_picker = {
                        use_winbar = "always",
                    },
                },
                show_prompt = false,
                highlights = {
                    enabled = true,
                    statusline = {
                        focused = "WindowPickerStatusLine",
                        unfocused = "WindowPickerStatusLineNC",
                    },
                    winbar = {
                        focused = "WindowPickerWinBar",
                        unfocused = "WindowPickerWinBarNC",
                    },
                },
            },
        },
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
                never_show_by_pattern = vim.opt.wildignore:get(),
            },
            use_libuv_file_watcher = true,
            follow_current_file = {
                enabled = true,
            },
            window = {
                mappings = {
                    ["<C-f>"] = function(state)
                        local node = state.tree:get_node()
                        local path = node.type == "directory" and node.path or vim.fn.fnamemodify(node.path, ":h")
                        require("snacks").picker.files({ cwd = path })
                    end,
                    ["<C-s>"] = function(state)
                        local node = state.tree:get_node()
                        local path = node.type == "directory" and node.path or vim.fn.fnamemodify(node.path, ":h")
                        require("snacks").picker.grep({ cwd = path })
                    end,
                    ["<C-v>"] = "open_vsplit",
                    ["<C-x>"] = "open_split",
                },
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
