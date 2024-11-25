return {
    "stevearc/oil.nvim",
    init = function()
        vim.keymap.set("n", "-", function()
            require("oil").open()
        end, { desc = "Open Parent Directory" })
    end,
    opts = {
        keymaps = {
            ["<C-v>"] = "actions.select_vsplit",
            ["<C-x>"] = "actions.select_split",
            ["<C-t>"] = "actions.select_tab",
            ["<C-p>"] = "actions.preview",
            ["<C-c>"] = "actions.close",
            ["<C-r>"] = "actions.refresh",
            ["<C-f>"] = {
                function()
                    local basedir = require("oil").get_current_dir()
                    require("telescope.builtin").find_files({
                        cwd = basedir,
                        search_dirs = { basedir },
                    })
                end,
                mode = "n",
                nowait = true,
                desc = "Find files in the current directory",
            },
            ["<C-s>"] = {
                function()
                    local basedir = require("oil").get_current_dir()
                    require("telescope.builtin").live_grep({
                        cwd = basedir,
                        search_dirs = { basedir },
                    })
                end,
                mode = "n",
                nowait = true,
                desc = "Live grep in the current directory",
            },
            ["g?"] = "actions.show_help",
            ["<CR>"] = "actions.select",
            ["-"] = "actions.parent",
            ["_"] = "actions.open_cwd",
            ["`"] = "actions.cd",
            ["~"] = "actions.tcd",
            ["g."] = "actions.toggle_hidden",
        },
        use_default_keymaps = false,
        view_options = {
            show_hidden = true,
        },
    },
}
