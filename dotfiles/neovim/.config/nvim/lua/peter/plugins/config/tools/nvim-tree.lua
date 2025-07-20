return {
    "nvim-tree/nvim-tree.lua",
    dependencies = {
        {
            dir = "~/.config/nvim/plugins/nvim-tree-utils",
        },
    },
    cmd = {
        "NvimTreeOpen",
        "NvimTreeClose",
        "NvimTreeToggle",
        "NvimTreeRefresh",
        "NvimTreeFindFile",
        "NvimTreeFindFileToggle",
        "NvimTreeClipboard",
    },
    keys = {
        { "<leader>e", "<CMD>NvimTreeFindFileToggle<CR>", desc = "Explorer" },
    },
    config = function()
        require("nvim-tree").setup({
            auto_reload_on_write = false,
            hijack_unnamed_buffer_when_opening = false,
            hijack_directories = {
                enable = false,
            },
            update_focused_file = {
                enable = true,
            },
            filters = {
                custom = {
                    "^.git$",
                    "^.venv$",
                    "^__pycache__$",
                    "^node_modules$",
                },
            },
            git = {
                enable = false,
                ignore = false,
            },
            view = {
                signcolumn = "no",
            },
            on_attach = function(bufnr)
                local api = require("nvim-tree.api")

                local function opts(desc)
                    return { desc = "nvim-tree: " .. desc, buffer = bufnr, noremap = true, silent = true, nowait = true }
                end

                api.config.mappings.default_on_attach(bufnr)

                vim.keymap.del("n", "s", { buffer = bufnr })
                vim.keymap.del("n", "S", { buffer = bufnr })

                local utils = require("nvim-tree-utils")

                vim.keymap.set("n", "<C-f>", function()
                    utils.launch_telescope("find_files")
                end, opts("Telescope Files"))

                vim.keymap.set("n", "<C-s>", function()
                    utils.launch_telescope("live_grep")
                end, opts("Telescope Grep"))
            end,
            actions = {
                open_file = {
                    window_picker = {
                        exclude = {
                            filetype = require("peter.core.filetypes").excludes,
                            buftype = { "nofile", "terminal", "help" },
                        },
                    },
                },
            },
            renderer = {
                highlight_git = true,
            },
        })

        local prev = { new_name = "", old_name = "" } -- Prevents duplicate events
        vim.api.nvim_create_autocmd("User", {
            pattern = "NvimTreeSetup",
            callback = function()
                local events = require("nvim-tree.api").events
                events.subscribe(events.Event.NodeRenamed, function(data)
                    if prev.new_name ~= data.new_name or prev.old_name ~= data.old_name then
                        data = data
                        require("snacks").rename.on_rename_file(data.old_name, data.new_name)
                    end
                end)
            end,
        })
    end,
}
