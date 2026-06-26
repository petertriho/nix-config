return {
    "nvim-tree/nvim-tree.lua",
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
                custom = vim.g.wildignore_regex or {},
            },
            git = {
                enable = false,
                ignore = false,
            },
            view = {
                signcolumn = "no",
                width = 40,
            },
            on_attach = function(bufnr)
                local api = require("nvim-tree.api")
                api.config.mappings.default_on_attach(bufnr)

                vim.keymap.del("n", "s", { buffer = bufnr })
                vim.keymap.del("n", "S", { buffer = bufnr })

                local function opts(desc)
                    return { desc = "nvim-tree: " .. desc, buffer = bufnr, noremap = true, silent = true, nowait = true }
                end

                local function get_node_path()
                    local node = api.tree.get_node_under_cursor()
                    if node.type == "directory" then
                        return node.absolute_path
                    else
                        return vim.fn.fnamemodify(node.absolute_path, ":h")
                    end
                end

                vim.keymap.set("n", "<C-f>", function()
                    local cwd = get_node_path()
                    require("snacks").picker.files({ cwd = cwd })
                end, opts("Find Files"))

                vim.keymap.set("n", "<C-s>", function()
                    local cwd = get_node_path()
                    require("snacks").picker.grep({ cwd = cwd })
                end, opts("Live Grep"))
            end,
            actions = {
                open_file = {
                    window_picker = {
                        exclude = {
                            filetype = require("peter.core.filetypes").excludes,
                            buftype = { "nofile", "terminal", "help", "quickfix" },
                        },
                    },
                },
            },
            renderer = {
                highlight_git = true,
                indent_markers = {
                    enable = true,
                },
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
